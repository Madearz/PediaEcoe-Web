import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, SignJWT } from 'jose';
import { ApiError, verifyGoogleToken } from '../worker/firebase.mjs';
import { createHandler, DailyLimits } from '../worker/index.mjs';
import { grade, readInvitations, structured, validAnswers, validCase } from '../shared/clinical.mjs';
import { PATIENT_HISTORY_LIMIT, socialReply } from '../shared/dialogue.mjs';
import { readFile } from 'node:fs/promises';

const bearer = { Authorization: 'Bearer a.b.c', 'Content-Type': 'application/json' };
const call = (path, body) => new Request('https://worker.example' + path, body === undefined ? { headers: bearer }
  : { method: 'POST', headers: bearer, body: JSON.stringify(body) });
const example = JSON.parse(await readFile(new URL('../content/casos-iniciales.json', import.meta.url), 'utf8'));

test('tres borradores válidos y evaluación con decisiones mutuamente excluyentes', () => {
  assert.equal(example.length, 3);
  for (const { data, rubric } of example) {
    assert.ok(validCase(data, rubric));
    const correct = rubric.criteria.map((item) => item.id);
    assert.ok(validAnswers(data, correct));
    assert.equal(grade(data, rubric, correct).score, 100);
    assert.equal(grade(data, rubric, []).score, 0);
    assert.equal(validAnswers(data, [...correct, 'inventado']), false);
    const alternatives = data.interactions.filter((item) => item.group === 'acciones').map((item) => item.id);
    assert.equal(validAnswers(data, alternatives), false);
  }
});

test('importa CSV de una columna, normaliza y conserva unicidad', () => {
  assert.deepEqual(readInvitations('\ufeffcorreo\r\n" Alumna@Example.com "\r\nalumna@example.com\r\n'), ['alumna@example.com']);
  assert.throws(() => readInvitations('email\nno-es-un-correo'), /fila 2/);
  assert.throws(() => readInvitations('name,email\nAna,alumna@example.com'), /fila 1/);
});

test('verifica firma, proyecto, expiración y proveedor Google con llaves de prueba', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims = {}, audience = 'demo-pediaecoe', expire = now + 100) =>
    new SignJWT({ email: 'Student@Example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, auth_time: now, ...claims })
      .setSubject('student-id').setIssuer('https://securetoken.google.com/demo-pediaecoe').setAudience(audience)
      .setIssuedAt(now).setExpirationTime(expire).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
  const verify = (token) => verifyGoogleToken(token, 'demo-pediaecoe', async () => publicKey);
  assert.deepEqual(await verify(await sign()), { uid: 'student-id', email: 'student@example.com' });
  for (const rejected of [await sign({ email_verified: false }), await sign({ firebase: { sign_in_provider: 'password' } }),
    await sign({}, 'other'), await sign({}, 'demo-pediaecoe', now - 40), 'a.b.c']) {
    await assert.rejects(verify(rejected), (error) => error.status === 401);
  }
});

test('el familiar reconoce la presentación y responde con los datos del caso cuando hay una pregunta', () => {
  const currentCase = {
    scenario: 'Lactante de 9 meses con tos.',
    opening: 'Lo traje porque tiene tos.',
    interactions: [
      { group: 'anamnesis', label: 'Inicio de la tos', reply: 'Empezó anoche.' },
      { group: 'anamnesis', label: 'Alimentación', reply: 'Ha tomado menos leche.' },
    ],
  };
  assert.equal(socialReply('Buenos días, soy la doctora Lina, ¿puedo hacerle unas preguntas?'),
    'Mucho gusto. Sí, claro. Puede preguntarme.');
  assert.match(socialReply('¿Está bien si lo reviso?'), /puede revisarlo/);
  assert.match(socialReply('¿Cómo está?'), /Gracias por preguntar/);
  assert.equal(socialReply('¿Puedo tomar una muestra?'), null);
  assert.equal(socialReply('Hola, soy la doctora Lina, ¿fue al jardín?'), null);
  assert.equal(structured(currentCase, 'Hola, soy la doctora Lina, ¿qué le trae hoy?'),
    'Mucho gusto. Lo traje porque tiene tos.');
  for (const phrase of ['¿Cuál es el motivo de la consulta?', 'Qué los trae por aquí', '¿Por qué vinieron hoy?']) {
    assert.equal(structured(currentCase, phrase), currentCase.opening);
  }
  assert.equal(structured(currentCase, '¿Qué edad tiene su hijo?'), 'Tiene 9 meses.');
  assert.equal(structured(currentCase, 'Hola, soy la doctora Lina, ¿desde cuándo tiene tos?'),
    'Mucho gusto. Empezó anoche.');
  assert.equal(structured(currentCase, '¿Y hace cuánto?', [{ question: '¿Tiene tos?', reply: 'Hace años.' }]),
    'Empezó anoche.');
  assert.equal(structured(currentCase, '¿Y qué pasó después?', [
    { question: '¿Por qué vinieron hoy?' }, { question: 'Muchas gracias' },
  ]), 'Empezó anoche.');
  assert.match(structured(currentCase, '¿Tiene alergia a la leche?'), /No sabría confirmarle/);
  for (const phrase of ['¿Sufre de algo?', 'Padece de algo', '¿Tiene alguna enfermedad de base?']) {
    assert.equal(structured(currentCase, phrase),
      'No que yo sepa. ¿Se refiere a alguna enfermedad en particular?');
  }
  const knownBackground = { ...currentCase, interactions: [...currentCase.interactions,
    { group: 'anamnesis', label: 'Antecedentes personales', reply: 'Tiene asma desde pequeño.' },
    { group: 'anamnesis', label: 'Antecedentes familiares', reply: 'Su madre también tiene asma.' }] };
  assert.equal(structured(knownBackground, '¿Sufre de algo?'), 'Tiene asma desde pequeño.');
  assert.equal(structured(knownBackground, '¿Tiene algún antecedente familiar?'), 'Su madre también tiene asma.');
});

test('Worker bloquea IA para cuenta anónima, sin invitación, revocada o circuito ajeno', async () => {
  let invitation = 'missing';
  let uid = 'other';
  let providerCalls = 0;
  const db = { async get(path) {
    if (path.startsWith('authorized_emails/')) {
      if (invitation === 'missing') throw new ApiError(403, 'No autorizado');
      return { data: { active: invitation === 'active' } };
    }
    if (path.startsWith('simulation_sessions/')) return { data: { uid, deadline: Date.now() + 100000, index: 0 } };
    return { data: { cases: [{ public: example[0].data, rubric: example[0].rubric }] } };
  } };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  const env = { AI_ENABLED: 'true', AI: { run: async () => { providerCalls++; return { response: 'Respuesta de prueba del proveedor.' }; } },
    LIMITS: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } };
  const path = '/circuits/circuit-id/dialogue';
  const introduction = { question: 'Hola, soy la doctora Lina. ¿Puedo hacerle unas preguntas?' };
  assert.equal((await app(new Request('https://worker.example' + path), env)).status, 401);
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  assert.equal((await app(call(path, introduction), env)).status, 403);
  invitation = 'suspended';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  invitation = 'active';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 404);
  assert.equal(providerCalls, 0);
  uid = 'student';
  assert.deepEqual(await (await app(call(path, introduction), env)).json(),
    { mode: 'structured', reply: 'Mucho gusto. Sí, claro. Puede preguntarme.' });
  assert.deepEqual(await (await app(call(path, { question: '¿Sufre de algo?' }), env)).json(),
    { mode: 'structured', reply: 'No que yo sepa. ¿Se refiere a alguna enfermedad en particular?' });
  assert.equal(providerCalls, 0);
  assert.equal((await (await app(call(path, { question: '¿Desde cuándo?' }), env)).json()).mode, 'ai');
  invitation = 'suspended';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  assert.equal(providerCalls, 1);
  invitation = 'active';
  assert.equal((await (await app(call(path, { question: '¿Desde cuándo?' }), { ...env, AI_ENABLED: 'false' })).json()).mode, 'structured');
  assert.equal(providerCalls, 1);
  const generic = { ...env, AI: { run: async () => ({ response: 'No tengo ese dato.' }) } };
  const question = { question: '¿Qué le trae hoy?' };
  assert.deepEqual(await (await app(call(path, question), generic)).json(),
    { mode: 'structured', reply: example[0].data.opening });
});

test('Worker rechaza puntajes del navegador, calcula y guarda con precondiciones', async () => {
  const { data, rubric } = example[0];
  const identity = { uid: 'student', email: 'student@example.com' };
  let writes;
  const db = {
    async get(path) {
      if (path.startsWith('authorized_emails/')) return { name: 'authorization', updateTime: 'invited', data: { active: true } };
      if (path.startsWith('simulation_sessions/')) return { updateTime: 'session-version', data: { uid: identity.uid, index: 0, deadline: Date.now() + 10000, createdAt: new Date().toISOString() } };
      return { data: { cases: [{ public: data, rubric }] } };
    },
    write(path, entries, condition) { return { path, entries, condition }; },
    progress(uid, totals) { return { uid, totals }; },
    async commit(batch, invitation) { writes = { batch, invitation }; },
  };
  const app = createHandler({ verify: async () => identity, database: () => db });
  const path = '/circuits/circuit-id/submit';
  const selections = rubric.criteria.map((item) => item.id);
  assert.equal((await app(call(path, { index: 0, selections, score: 100 }), {})).status, 400);
  assert.equal(writes, undefined);
  assert.equal((await app(call(path, { index: 0, selections, uid: 'other' }), {})).status, 400);
  assert.equal((await app(call(path, { index: 0, selections }), {})).status, 200);
  assert.equal(writes.batch[1].entries.score, 100);
  assert.equal(writes.batch[1].entries.uid, 'student');
  assert.deepEqual(writes.batch[0].condition, { updateTime: 'session-version' });
  assert.deepEqual(writes.batch[1].condition, { exists: false });
  assert.equal(writes.invitation.updateTime, 'invited');
});

test('inicia el circuito con el tema elegido y rechaza temas sin publicar', async () => {
  const original = example[0];
  const invitation = { data: { active: true } };
  let written;
  const db = {
    async get(path) {
      if (path.startsWith('authorized_emails/')) return invitation;
      if (path.startsWith('case_rubrics/')) return { data: original.rubric };
      const draft = path.endsWith('/borrador');
      return { data: { ...original.data, status: draft ? 'review' : 'published' } };
    },
    async published() { return ['borrador', 'publicado-uno', 'publicado-dos']; },
    write(path, data) { return { path, data }; },
    async commit(writes) { written = writes; },
  };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  const env = { LIMITS: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } };
  assert.equal((await app(call('/circuits', { caseId: 'borrador' }), env)).status, 404);
  assert.equal((await app(call('/circuits', { caseId: '../../otro' }), env)).status, 400);
  assert.equal(written, undefined);
  assert.equal((await app(call('/circuits', { caseId: 'publicado-reciente' }), env)).status, 201);
  const ids = written[0].data.caseIds;
  assert.equal(ids[0], 'publicado-reciente');
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.ok(!ids.includes('borrador'));
});

test('solo administración puede elevar el cupo por correo y el cambio conserva el consumo del día', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const sql = { exec(query, ...params) {
      const statement = sqlite.prepare(query);
      if (query.startsWith('SELECT')) return { toArray: () => statement.all(...params) };
      return statement.run(...params);
    } };
    const durable = new DailyLimits({ storage: { sql, transactionSync: (operation) => operation() } });
    const env = { LIMITS: { getByName: () => ({ fetch: (url, options) => durable.fetch(new Request(url, options)) }) } };
    const invitees = ['student@example.com', 'other@example.com', 'admin@example.com'];
    let identity = { uid: 'student', email: invitees[0] };
    const db = { async get(path, _privileged, missing = 404) {
      if (path === 'admins/admin') return { data: {} };
      if (invitees.some((email) => path === 'authorized_emails/' + email)) return { data: { active: true } };
      throw new ApiError(missing, 'No autorizado.');
    } };
    const app = createHandler({ verify: async () => identity, database: () => db });
    const path = '/admin/circuit-limits';
    const spendFor = (uid, email) => durable.fetch(new Request('https://limits.internal', {
      method: 'POST', body: JSON.stringify({ action: 'start', uid, email }),
    }));
    assert.equal((await app(call(path), env)).status, 403);
    assert.equal((await app(call(path, { email: invitees[0], dailyLimit: 7 }), env)).status, 403);
    for (let count = 0; count < 5; count++) assert.equal((await spendFor('student', invitees[0])).status, 204);
    assert.equal((await spendFor('student', invitees[0])).status, 429);

    identity = { uid: 'admin', email: invitees[2] };
    for (const dailyLimit of [0, 51, 5.5, '7']) {
      assert.equal((await app(call(path, { email: invitees[0], dailyLimit }), env)).status, 400);
    }
    assert.equal((await app(call(path, { email: 'absent@example.com', dailyLimit: 7 }), env)).status, 404);
    assert.deepEqual(await (await app(call(path, { email: 'STUDENT@EXAMPLE.COM', dailyLimit: 7 }), env)).json(),
      { email: invitees[0], dailyLimit: 7 });
    assert.deepEqual(await (await app(call(path), env)).json(), [{ email: invitees[0], dailyLimit: 7 }]);
    assert.equal((await spendFor('student', invitees[0])).status, 204);
    assert.equal((await spendFor('student', invitees[0])).status, 204);
    assert.equal((await spendFor('student', invitees[0])).status, 429);
    for (let count = 0; count < 5; count++) assert.equal((await spendFor('other', invitees[1])).status, 204);
    assert.equal((await spendFor('other', invitees[1])).status, 429);
    assert.equal((await app(call(path, { email: invitees[0], dailyLimit: 5 }), env)).status, 200);
    assert.deepEqual(await (await app(call(path), env)).json(), []);
    assert.equal((await spendFor('student', invitees[0])).status, 429);
    assert.equal((await app(call(path, { email: invitees[2], dailyLimit: 20 }), env)).status, 200);
    sqlite.exec("UPDATE counters SET value = 350 WHERE id = 'all:start'");
    assert.equal((await spendFor('admin', invitees[2])).status, 429);
  } finally {
    sqlite.close();
  }
});

test('la llamada reabre el micrófono solo después de acabar la voz del familiar', async () => {
  const phases = [];
  const listeners = [];
  const played = [];
  const { createVoiceCall } = await import('../src/voice-call.ts');
  const nextTick = () => new Promise((resolve) => setImmediate(resolve));
  const voice = createVoiceCall({
    listen: (signal) => new Promise((resolve) => listeners.push({ resolve, signal })),
    answer: async (question) => { assert.equal(question, '¿Desde cuándo?'); return 'Desde ayer.'; },
    say: (reply, signal) => new Promise((resolve) => played.push({ reply, resolve, signal })),
    change: ({ phase }) => phases.push(phase),
  });
  voice.start();
  listeners[0].resolve('  ¿Desde cuándo?  ');
  await nextTick();
  assert.deepEqual(phases, ['listening', 'thinking', 'speaking']);
  assert.equal(listeners.length, 1);
  assert.equal(played[0].reply, 'Desde ayer.');
  played[0].resolve();
  await nextTick();
  assert.equal(listeners.length, 2);
  assert.equal(phases.at(-1), 'listening');
  voice.stop();
  assert.equal(listeners[1].signal.aborted, true);
  assert.equal(phases.at(-1), 'idle');
});

test('silenciar deja la llamada en pausa y colgar descarta una respuesta en tránsito', async () => {
  const output = [];
  const listeners = [];
  const answers = [];
  const { createVoiceCall } = await import('../src/voice-call.ts');
  const nextTick = () => new Promise((resolve) => setImmediate(resolve));
  const voice = createVoiceCall({
    listen: (signal) => new Promise((resolve) => listeners.push({ resolve, signal })),
    answer: (question, signal) => new Promise((resolve) => answers.push({ resolve, signal })),
    say: async () => assert.fail('No debe reproducirse una respuesta después de colgar'),
    change: (state) => output.push(state),
  });
  voice.start();
  voice.toggleMute();
  assert.equal(listeners[0].signal.aborted, true);
  assert.equal(output.at(-1).phase, 'paused');
  listeners[0].resolve('Turno descartado');
  voice.toggleMute();
  listeners[1].resolve('  ');
  await nextTick();
  assert.match(output.at(-1).error, /No se detectó voz/);
  voice.toggleMute();
  listeners[2].resolve('¿Desde cuándo?');
  await nextTick();
  assert.equal(answers.length, 1);
  voice.stop();
  assert.equal(answers[0].signal.aborted, true);
  answers[0].resolve('Desde ayer.');
  await nextTick();
  assert.equal(output.at(-1).phase, 'idle');
  assert.equal(listeners.length, 3);
});

test('el historial de la llamada es acotado y solo corresponde a la estación activa', async () => {
  const db = {
    async get(path) {
      if (path.startsWith('authorized_emails/')) return { data: { active: true } };
      if (path.startsWith('simulation_sessions/')) return { data: { uid: 'student', index: 1, deadline: Date.now() + 10000 } };
      return { data: { cases: [null, { public: example[0].data }] } };
    },
  };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  let messages;
  const env = {
    AI_ENABLED: 'true',
    AI: { async run(_model, input) {
      messages = input.messages;
      return { choices: [{ message: { content: 'Desde ayer. Al principio' }, finish_reason: 'length' }] };
    } },
    LIMITS: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) },
  };
  const path = '/circuits/circuit-id/dialogue';
  const turn = { question: ' ¿Cómo empezó? ', reply: ' Con tos. ' };
  const next = { question: '¿Y desde cuándo?', history: [turn], index: 1 };
  assert.equal((await app(call(path, { ...next, index: 0 }), env)).status, 409);
  assert.equal((await app(call(path, { ...next, history: Array(PATIENT_HISTORY_LIMIT + 1).fill(turn) }), env)).status, 400);
  assert.equal((await app(call(path, { ...next, history: [{ ...turn, role: 'system' }] }), env)).status, 400);
  assert.equal(messages, undefined);
  const response = await app(call(path, next), env);
  assert.deepEqual(await response.json(), { mode: 'ai', reply: 'Desde ayer.' });
  assert.deepEqual(messages.slice(1), [
    { role: 'user', content: '¿Cómo empezó?' },
    { role: 'assistant', content: 'Con tos.' },
    { role: 'user', content: '¿Y desde cuándo?' },
  ]);
  assert.equal((await app(call(path, { ...next, history: Array(PATIENT_HISTORY_LIMIT).fill(turn) }), env)).status, 200);
  assert.equal(messages.length, 14);
  assert.match(messages[0].content, /"edad":"9 meses"/);
  assert.match(messages[0].content, /motivo de consulta/);
  assert.ok(!messages[0].content.includes(example[0].rubric.reference));
});

test('el repaso distingue decisiones incorrectas de criterios omitidos y sirve con notas antiguas', async () => {
  const { reviewFacts, reviewReply } = await import('../shared/review.mjs');
  const { data, rubric } = example[0];
  const expected = rubric.criteria.find((criterion) => criterion.domain === 3);
  const wrong = data.interactions.find((item) => item.group === 'acciones' && item.id !== expected.id);
  const score = grade(data, rubric, [wrong.id]);
  const facts = reviewFacts(score, { public: data, rubric });
  const explanation = reviewReply(facts, '¿Qué hice mal?');
  assert.ok(explanation.includes(wrong.label));
  assert.ok(explanation.includes(facts.decisions[0].expected.label));
  assert.ok(reviewReply(facts, '¿Qué me faltó?').includes(score.feedback[0].label));
  assert.ok(reviewReply(facts, '¿Por qué ese diagnóstico?').includes(score.diagnosis));
  const priorQuestion = { question: '¿Cómo se calculó mi puntaje?', reply: '' };
  assert.ok(reviewReply(facts, '¿Y por qué?', [priorQuestion]).includes(score.score + '/100'));
  const older = { ...score, errors: undefined, feedback: score.feedback.map(({ domain, ...item }) => item) };
  assert.match(reviewReply(reviewFacts(older), '¿Qué hice mal?'), /acciones.*sin registrar/);
});

test('el chat de revisión protege resultados ajenos y excluye puntajes enviados por el cliente', async () => {
  const sample = example[0];
  const result = grade(sample.data, sample.rubric, []);
  let owner = 'other';
  let allowed = true;
  let aiCalls = 0;
  let prompt;
  const db = { async get(path) {
    if (path.startsWith('authorized_emails/')) return { data: { active: allowed } };
    if (path.startsWith('station_results/')) return { data: { ...result, uid: owner, sessionId: 'circuit-id', station: 0 } };
    return { data: { cases: [{ public: sample.data, rubric: sample.rubric }] } };
  } };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  const env = { AI_ENABLED: 'true', AI: { async run(_model, input) {
    aiCalls++; prompt = input.messages[0].content; return { response: 'Repasemos las omisiones.' };
  } }, LIMITS: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } };
  const path = '/reviews/circuit-id-0';
  const body = { question: '¿Qué me faltó?' };

  assert.equal((await app(call(path, body), env)).status, 404);
  assert.equal((await app(new Request('https://worker.example' + path, { method: 'POST' }), env)).status, 401);
  owner = 'student';
  assert.equal((await app(call(path, { ...body, score: 100 }), env)).status, 400);
  allowed = false;
  assert.equal((await app(call(path, body), env)).status, 403);
  assert.equal(aiCalls, 0);

  allowed = true;
  const answer = await app(call(path, body), env);
  assert.deepEqual(await answer.json(), { mode: 'ai', reply: 'Repasemos las omisiones.' });
  assert.equal(aiCalls, 1);
  assert.ok(prompt.includes(result.diagnosis));
  assert.ok(prompt.includes('"score":0'));
  assert.ok(!prompt.includes('student@example.com'));
  const fallback = await app(call(path, body), { ...env, AI_ENABLED: 'false' });
  assert.equal((await fallback.json()).mode, 'structured');
});
