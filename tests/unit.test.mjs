import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { ApiError, verifyGoogleToken } from '../worker/firebase.mjs';
import { createHandler } from '../worker/index.mjs';
import { grade, readInvitations, validAnswers, validCase } from '../shared/clinical.mjs';
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
  assert.equal((await app(new Request('https://worker.example' + path), env)).status, 401);
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  invitation = 'suspended';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  invitation = 'active';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 404);
  assert.equal(providerCalls, 0);
  uid = 'student';
  assert.equal((await (await app(call(path, { question: '¿Desde cuándo?' }), env)).json()).mode, 'ai');
  invitation = 'suspended';
  assert.equal((await app(call(path, { question: '¿Desde cuándo?' }), env)).status, 403);
  assert.equal(providerCalls, 1);
  invitation = 'active';
  assert.equal((await (await app(call(path, { question: '¿Desde cuándo?' }), { ...env, AI_ENABLED: 'false' })).json()).mode, 'structured');
  assert.equal(providerCalls, 1);
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
