import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, SignJWT } from 'jose';
import { ApiError, verifyGoogleToken } from '../worker/firebase.mjs';
import { createHandler, DailyLimits } from '../worker/index.mjs';
import { grade, readInvitations, structured, validAnswers, validCase } from '../shared/clinical.mjs';
import { isVaccinationCardRequest, PATIENT_HISTORY_LIMIT, socialReply, vaccinationCard } from '../shared/dialogue.mjs';
import { caseGroups } from '../shared/case-groups.mjs';
import { examAreas, requestedExam, systemExam } from '../shared/exam.mjs';
import { practiceFocus, registerAnamnesis } from '../shared/learning.mjs';
import { addDiagnosticChoices } from '../worker/evolutions.mjs';
import { availableStudyOptions, displayStoredStudy, isStudyListRequest, MISSING_STUDY_VALUE, requestedStudies, studySuggestions } from '../shared/studies.mjs';
import { readFile } from 'node:fs/promises';

const bearer = { Authorization: 'Bearer a.b.c', 'Content-Type': 'application/json' };
const call = (path, body) => new Request('https://worker.example' + path, body === undefined ? { headers: bearer }
  : { method: 'POST', headers: bearer, body: JSON.stringify(body) });
const example = JSON.parse(await readFile(new URL('../content/casos-iniciales.json', import.meta.url), 'utf8'));

test('el banco clasifica los casos previos y conserva los grupos elegidos en administración', async () => {
  assert.deepEqual(await caseGroups('hiponatremia'), ['A']);
  assert.deepEqual(await caseGroups('diarrea-persistente'), ['B']);
  assert.deepEqual(await caseGroups('practica100-bronquiolitis-apnea'), ['A', 'B']);
  assert.deepEqual(await caseGroups('nuevo', undefined, 'Guía local · Grupo B, pp. 3–5 · Grupo A pp. 7'), ['A', 'B']);
  assert.deepEqual(await caseGroups('nuevo', undefined, 'Grupo ABC'), []);
  assert.deepEqual(await caseGroups('practica100-bronquiolitis-apnea', ['B']), ['B']);
  assert.deepEqual(await caseGroups('hiponatremia', []), []);
  assert.ok(validCase({ ...example[0].data, curricularGroups: ['A', 'B'] }, example[0].rubric));
  assert.equal(validCase({ ...example[0].data, curricularGroups: ['A', 'A'] }, example[0].rubric), false);
});

test('la exploración se puede localizar por todos los sistemas que indica su etiqueta', () => {
  assert.deepEqual(examAreas('Saturación, tiraje y llenado capilar'), ['vitals', 'respiratory', 'cardiovascular']);
  assert.deepEqual(examAreas('Examen neurológico y signos meníngeos'), ['neurological']);
  assert.deepEqual(examAreas('Hidratación y exantema'), ['abdomen', 'skin']);
  assert.deepEqual(examAreas('Otoscopia'), ['ent']);
});

test('la anamnesis acumula preguntas por tema y espera a cubrir los criterios agrupados', () => {
  const interactions = [
    { id: 'history', group: 'anamnesis', label: 'Inicio de síntomas respiratorios' },
    { id: 'intake', group: 'anamnesis', label: 'Tomas, pañales y episodios de apnea' },
  ];
  const start = registerAnamnesis(interactions, '¿Desde cuándo tiene fiebre?');
  assert.deepEqual(start.registered, []);
  const cough = registerAnamnesis(interactions, '¿Tiene tos?', start.evidence);
  assert.deepEqual(cough.registered, []);
  const chronology = registerAnamnesis(interactions, '¿Desde cuándo?', cough.evidence);
  assert.deepEqual(chronology.registered, ['history']);
  const milk = registerAnamnesis(interactions, '¿Está tomando leche?', chronology.evidence);
  assert.deepEqual(milk.registered, []);
  const urination = registerAnamnesis(interactions, '¿Cuántos pañales ha mojado?', milk.evidence);
  assert.deepEqual(urination.registered, []);
  assert.deepEqual(registerAnamnesis(interactions, '¿Ha hecho pausas al respirar?', urination.evidence).registered, ['intake']);
});

test('la exploración completa conserva los hallazgos y solo simula sistemas sin indicios en el caso', () => {
  const recorded = { id: 'lungs', group: 'exploracion', label: 'Auscultación pulmonar', reply: 'Sibilancias bilaterales.' };
  const data = { title: 'Tos', scenario: 'Paciente de 8 años', opening: 'Tiene tos.', interactions: [recorded] };
  assert.deepEqual(systemExam(data, 'respiratory').recorded, [recorded]);
  assert.match(systemExam(data, 'abdomen').reply, /Abdomen blando/);
  assert.equal(systemExam({ ...data, interactions: [] }, 'respiratory').reply, '');
});

test('la rúbrica separa diagnóstico principal y diferenciales sin cambiar los 100 puntos', () => {
  const { data, rubric, id } = example[0];
  const { public: expanded, rubric: scoring } = addDiagnosticChoices(id, data, rubric, (items) => items);
  assert.equal(expanded.interactions.filter((item) => item.group === 'razonamiento').length, 4);
  assert.ok(validCase(expanded, scoring));
  const selections = rubric.criteria.map(({ id }) => id);
  assert.equal(grade(expanded, scoring, selections, scoring.differentials).score, 100);
  assert.equal(grade(expanded, scoring, selections, [scoring.differentials[0]]).score, 97);
  assert.equal(grade(expanded, scoring, selections).score, 94);
  const results = [{ domains: [20, 10, 20, 25, 15], caseId: 'case-one' }, { domains: [15, 8, 20, 25, 15] }];
  assert.equal(practiceFocus(results).index, 1);
  assert.equal(practiceFocus(results).result.caseId, 'case-one');
});

test('las solicitudes de examen físico devuelven los hallazgos pertinentes y separan anamnesis y permiso', () => {
  const lungs = { id: 'lungs', group: 'exploracion', label: 'Auscultación pulmonar', reply: 'Sibilancias bilaterales.' };
  const vitals = { id: 'vitals', group: 'exploracion', label: 'Signos vitales', reply: 'Saturación de oxígeno 94 %.' };
  const abdominal = { id: 'abdomen', group: 'exploracion', label: 'Palpación de abdomen', reply: 'Abdomen blando.' };
  const notes = { id: 'history', group: 'anamnesis', label: 'Síntomas respiratorios', reply: 'Tose mucho.' };
  const interactions = [lungs, vitals, abdominal, notes];
  assert.deepEqual(requestedExam(interactions, 'Examen físico, por favor'), [lungs, vitals, abdominal]);
  assert.deepEqual(requestedExam(interactions, '¿Qué escucho al auscultar?'), [lungs]);
  assert.deepEqual(requestedExam(interactions, '¿Cuál es la saturación?'), [vitals]);
  assert.deepEqual(requestedExam(interactions, 'Palpo el abdomen'), [abdominal]);
  assert.deepEqual(requestedExam(interactions, '¿Qué encuentro a la otoscopia?'), []);
  assert.equal(requestedExam(interactions, '¿Desde cuándo tiene tos?'), null);
  assert.equal(requestedExam(interactions, '¿Puedo examinarlo?'), null);
});

test('los paraclínicos priorizan el resultado del caso y solo simulan normalidad fuera del contexto', () => {
  const radiograph = { id: 'radiograph', group: 'paraclinicos', label: 'Radiografía de tórax', reply: 'Opacidad en base derecha.' };
  const respiratory = { title: 'Tos', category: 'Respiratorio', scenario: 'Paciente de 8 años', opening: 'Tiene respiración rápida.',
    interactions: [radiograph] };
  assert.deepEqual(requestedStudies(respiratory, 'Solicito una radiografía de tórax'), { documented: [radiograph], supplemental: [] });
  const normal = requestedStudies(respiratory, 'Pido sodio y potasio');
  assert.equal(normal.documented.length, 0);
  assert.deepEqual(normal.supplemental.map(({ kind, reply }) => [kind, reply]),
    [['simulated', 'Sodio 140 mmol/L.'], ['simulated', 'Potasio 4,2 mmol/L.']]);
  assert.deepEqual(requestedStudies(respiratory, 'Sodio y potasio, por favor'), normal);
  const noRadiograph = { ...respiratory, interactions: [] };
  assert.equal(requestedStudies(noRadiograph, '¿Cuál es el resultado de la radiografía de tórax?').supplemental[0].kind, 'unavailable');
  const metabolic = { ...respiratory, interactions: [{ group: 'exploracion', label: 'Glucemia y estado mental', reply: 'Glucemia baja y somnolencia.' }] };
  assert.deepEqual(requestedStudies(metabolic, 'Glucosa, por favor').supplemental[0],
    { label: 'Glucosa', id: 'glucosa', kind: 'simulated', reply: 'Glucosa 48 mg/dL.' });
  assert.equal(requestedStudies(respiratory, '¿Le hicieron una radiografía de tórax antes de venir?'), null);
  assert.equal(requestedStudies(respiratory, '¿Tiene tos?'), null);
});

test('la estación de anemia ofrece estudios pertinentes y reconoce la hemoglobina por su nombre', () => {
  const data = { title: 'Anemia sin mejoría durante un tratamiento indicado', category: 'Hematología',
    scenario: 'Paciente simulado de 5 años', opening: 'Sigue cansado.', interactions: [
      { group: 'exploracion', label: 'Tendencia del hemograma', reply: 'Persiste microcitosis.' },
    ] };
  assert.deepEqual(studySuggestions(data).map((item) => item.label), ['Hemograma', 'Hemoglobina', 'Ferritina']);
  assert.deepEqual(requestedStudies(data, '¿Cuánto tiene de hemoglobina?').supplemental[0],
    { id: 'hemoglobina', label: 'Hemoglobina', kind: 'case', reply: 'Hemoglobina 9,6 g/dL.' });
  assert.match(requestedStudies(data, 'Solicito Hemograma').supplemental[0].reply, /VCM 68 fL/);
  assert.equal(requestedStudies(data, 'Pido ferritina').supplemental[0].kind, 'case');
  assert.equal(requestedStudies(data, 'Pido sodio').supplemental[0].kind, 'simulated');
  const documented = { id: 'lab', group: 'paraclinicos', label: 'Hemograma', reply: 'Hemoglobina 8,8 g/dL.' };
  assert.deepEqual(requestedStudies({ ...data, interactions: [documented] }, '¿Cuál es la Hb?').documented, [documented]);
});

test('otras estaciones muestran mediciones y mantienen separados los resultados sin cifra', () => {
  const station = (title, label, reply) => ({
    title, category: 'Urgencias', scenario: 'Caso simulado', opening: 'Venimos a consulta.',
    interactions: [{ group: 'exploracion', label, reply }],
  });
  const sodium = station('Alteración electrolítica', 'Perfusión y sodio en tendencia',
    'Hiponatremia moderada confirmada; conciencia conservada.');
  const sodiumResult = requestedStudies(sodium, '¿Cuánto tiene de sodio?').supplemental[0];
  assert.equal(sodiumResult.kind, 'simulated');
  assert.equal(sodiumResult.reply, 'Sodio 128 mmol/L.');
  const pending = station('Alteración electrolítica', 'Sodio en estudio', 'Hiponatremia sospechada; resultado pendiente.');
  assert.equal(requestedStudies(pending, 'Sodio').supplemental[0].reply, MISSING_STUDY_VALUE);
  const diabetes = station('Diabetes', 'Glucemia, cetonas y estado ácido-base',
    'Glucemia 340 mg/dL (alta), cetonas 4,0 mmol/L (elevadas).');
  assert.equal(requestedStudies(diabetes, 'Solicito glucosa').supplemental[0].kind, 'case');
  assert.doesNotMatch(requestedStudies(diabetes, 'Solicito cetonas').supplemental[0].reply, /alta|elevadas/);
  const bilirubin = station('Ictericia', 'Bilirrubina fraccionada', 'Bilirrubina directa 4,2 mg/dL (elevada), con hepatomegalia leve.');
  assert.equal(requestedStudies(bilirubin, 'Bilirrubina directa').supplemental[0].reply, 'Bilirrubina directa 4,2 mg/dL.');
  const lcr = station('Meningitis', 'Resultados del LCR', 'Pleocitosis linfocítica y glucosa conservada.');
  assert.equal(requestedStudies(lcr, 'Solicito análisis de líquido cefalorraquídeo').supplemental[0].kind, 'case');
  assert.equal(requestedStudies(lcr, 'Pido glucosa').supplemental[0].kind, 'unavailable');
  const skin = station('Dermatitis', 'Distribución de lesiones', 'Placas flexurales escamosas.');
  assert.ok(studySuggestions(skin).some(({ label }) => requestedStudies(skin, label).supplemental[0].kind === 'simulated'));
});

test('los paraclínicos del editor conservan el vínculo evaluable y muestran valor y unidad sin el rango', () => {
  const { data, rubric } = example[0];
  const legacy = data.interactions.find((item) => item.group === 'paraclinicos');
  const studyResults = [
    { id: legacy.id, label: 'Radiografía de tórax', value: 'Opacidad en base derecha.', unit: '', reference: 'Informe previo' },
    { id: 'lab-new', label: 'Hemoglobina', value: '10,2', unit: 'g/dL', reference: '11,5–15,5' },
  ];
  const edited = { ...data, studyResults };
  assert.ok(validCase(edited, rubric));
  assert.ok(!validCase({ ...edited, studyResults: [studyResults[0], studyResults[0]] }, rubric));
  assert.deepEqual(displayStoredStudy(edited, legacy), { ...legacy, label: 'Radiografía de tórax', reply: 'Opacidad en base derecha.' });
  assert.equal(requestedStudies(edited, 'Solicito radiografía de tórax').documented[0].id, legacy.id);
  const hemoglobin = requestedStudies(edited, 'Solicito hemoglobina').supplemental[0];
  assert.equal(hemoglobin.reply, '10,2 g/dL');
  assert.equal(hemoglobin.kind, 'case');
  assert.ok(studySuggestions(edited).some(({ label }) => label === 'Hemoglobina'));
});

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

test('las vacunas y el seguimiento «antes» se mantienen en el tema solicitado', () => {
  const base = { opening: 'Le salió un exantema en la cabeza.', interactions: [
    { group: 'anamnesis', label: 'Vacunas y secuencia del exantema', reply: 'El exantema empezó en la cara.' },
    { group: 'anamnesis', label: 'Síntomas y medicamentos', reply: 'Se queja de picor.' },
  ] };
  assert.equal(structured(base, '¿Tiene las vacunas al día?'),
    'No estoy seguro de si tiene todas las vacunas al día. Tendría que revisar el carné.');
  const incomplete = { ...base, interactions: [
    { group: 'anamnesis', label: 'Vacunación, contactos y secuencia del exantema', reply: 'Vacunación incompleta y contacto reciente; empezó en cara.' },
  ] };
  assert.equal(structured(incomplete, '¿Tiene las vacunas al día?'), 'Le faltan algunas vacunas.');
  assert.equal(structured(incomplete, 'Hola tiene las vacunas al día'), 'Hola, gracias por atendernos. Le faltan algunas vacunas.');
  assert.match(structured(incomplete, '¿Tiene la vacuna contra el sarampión?'), /esa vacuna en particular/);
  const completed = { ...base, interactions: [
    { group: 'anamnesis', label: 'Vacunas', reply: 'Vacunación al día, tolerancia oral conservada.' },
  ] };
  assert.equal(structured(completed, '¿Tiene las vacunas al día?'), 'Sí, tiene las vacunas al día.');
  const question = '¿Tomaba medicamentos?';
  const reply = structured(base, question);
  const history = [{ question, reply }];
  assert.match(reply, /antes/);
  assert.equal(structured(base, 'Antes', history), 'No recuerdo si le dieron algún medicamento antes de venir.');
  assert.equal(structured(base, 'Y los de ahora', [...history, { question: 'Antes', reply: 'No recuerdo.' }]),
    'No sé si recibió algún medicamento para este episodio.');
  const medicine = { ...base, interactions: [
    { group: 'anamnesis', label: 'Tratamiento previo', reply: 'Inició diurético hace pocos días, sin convulsiones ni desorientación.' },
  ] };
  assert.equal(structured(medicine, 'Los de antes', history), 'Inició diurético hace pocos días.');
  assert.equal(structured(medicine, '¿Tomó ibuprofeno?'), 'No recuerdo si tomó ese medicamento.');
});

test('la entrevista interpreta muletillas y preguntas cortas según el tema anterior', () => {
  const currentCase = { opening: 'Empezó con tos.', interactions: [
    { group: 'anamnesis', label: 'Inicio de la tos', reply: 'Empezó anoche.' },
    { group: 'anamnesis', label: 'Síntomas asociados', reply: 'También tuvo fiebre ayer.' },
    { group: 'anamnesis', label: 'Antecedentes personales', reply: 'Tiene asma desde pequeño.' },
    { group: 'anamnesis', label: 'Antecedentes médicos', reply: 'Desde hace un año le controlan la anemia.' },
    { group: 'anamnesis', label: 'Medicamentos', reply: 'Antes tomaba hierro. Hoy tomó paracetamol.' },
  ] };
  const first = 'Ajá, ¿y sufre de algo más?';
  const asthma = 'Tiene asma desde pequeño.';
  const anemia = 'Desde hace un año le controlan la anemia.';
  for (const phrase of [first, 'a ver y ya tenia algo de base', 'bueno y padece algo mas', '¿Tenía alguna otra enfermedad aparte de esto?']) {
    assert.equal(structured(currentCase, phrase), asthma);
  }
  const background = [{ question: first, reply: asthma }, { question: 'Ajá', reply: 'Sí, le escucho.' }];
  assert.equal(structured(currentCase, 'Bueno y algo más', background), anemia);
  assert.equal(structured(currentCase, '¿Y alguna otra cosa?', [...background, { question: 'Bueno y algo más', reply: anemia }]),
    'Por ahora, eso es lo que sé de sus antecedentes.');
  assert.equal(structured(currentCase, 'Ajá, ¿y qué más?', [{ question: '¿Por qué vino?', reply: currentCase.opening }]),
    'También tuvo fiebre ayer.');
  assert.equal(structured(currentCase, 'Ah bueno y desde cuándo', [{ question: '¿Tiene tos?', reply: 'Sí, tose.' }]), 'Empezó anoche.');
  assert.equal(structured(currentCase, 'A ver y por los de antes', [{ question: '¿Toma medicamentos?' }]), 'Antes tomaba hierro.');
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
  const fallback = { ...env, AI_ENABLED: 'false' };
  assert.deepEqual(await (await app(call(path, introduction), fallback)).json(),
    { mode: 'structured', reply: 'Mucho gusto. Sí, claro. Puede preguntarme.' });
  const vaccination = { question: '¿Tiene las vacunas al día?' };
  assert.match((await (await app(call(path, vaccination), fallback)).json()).reply, /revisar el carné/);
  const medication = { question: '¿Toma medicamentos?' };
  const firstMedication = await (await app(call(path, medication), fallback)).json();
  const priorMedication = { question: 'Antes', history: [{ ...medication, reply: firstMedication.reply }] };
  assert.equal((await (await app(call(path, priorMedication), fallback)).json()).reply,
    'No recuerdo si le dieron algún medicamento antes de venir.');
  assert.deepEqual(await (await app(call(path, { question: '¿Sufre de algo?' }), fallback)).json(),
    { mode: 'structured', reply: 'No que yo sepa. ¿Se refiere a alguna enfermedad en particular?' });
  for (const question of ['EPS', '¿A qué E.P.S. está afiliado?', '¿Tiene seguro médico?']) {
    assert.deepEqual(await (await app(call(path, { question }), fallback)).json(),
      { mode: 'structured', reply: 'Tendría que revisar los documentos para confirmarle lo de la EPS.' });
  }
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

test('la entrevista conserva el personaje y descarta respuestas repetidas al cambiar de tema', async () => {
  const data = { ...example[0].data, opening: 'Le salió un exantema en la cabeza.', interactions: [
    { group: 'anamnesis', label: 'Erupción', reply: 'Primero le salieron manchas en la cara.' },
    { group: 'anamnesis', label: 'Tos', reply: 'Empezó a toser ayer.' },
    { group: 'anamnesis', label: 'Vacunas', reply: 'Vacunación incompleta.' },
    { group: 'anamnesis', label: 'Afiliación', reply: 'Estamos en el régimen subsidiado, tiene un exantema.' },
  ] };
  const history = [{ question: '¿Dónde tiene el sarpullido?', reply: data.interactions[0].reply }];
  assert.equal(structured(data, 'Hola, ¿qué EPS tiene?', history),
    'Hola, gracias por atendernos. Estamos en el régimen subsidiado.');
  const db = { async get(path) {
    if (path.startsWith('authorized_emails/')) return { data: { active: true } };
    if (path.startsWith('simulation_sessions/')) return { data: { uid: 'student', index: 0, deadline: Date.now() + 10000 } };
    return { data: { cases: [{ public: data }] } };
  } };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  let response;
  const env = { AI_ENABLED: 'true', AI: { run: async () => ({ response }) },
    LIMITS: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } };
  const ask = async (question) => (await app(call('/circuits/circuit-id/dialogue', { question, history }), env)).json();
  for (response of ['No se detectaron comportamientos inadecuados.', 'Puede reformular su pregunta.', data.opening, history[0].reply]) {
    assert.deepEqual(await ask('¿Algo del jardín?'), { mode: 'structured', reply: 'No sabría precisarlo. Le puedo contar lo que sí he observado.' });
  }
  assert.deepEqual(await ask('¿Tiene tos?'), { mode: 'structured', reply: 'Empezó a toser ayer.' });
  assert.deepEqual(await ask('¿Tiene las vacunas al día?'), { mode: 'structured', reply: 'Le faltan algunas vacunas.' });
  assert.deepEqual(await ask('¿Dónde empezó la erupción?'), { mode: 'ai', reply: history[0].reply });
  response = 'En casa ha estado más irritable.';
  assert.deepEqual(await ask('¿Cómo se ha comportado en casa?'), { mode: 'ai', reply: response });
});

test('el carné distingue un resumen de las dosis y fechas registradas', () => {
  const { data, rubric } = example[0];
  const vaccine = { ...data, interactions: [...data.interactions, { id: 'vacunas', group: 'anamnesis', label: 'Vacunas', reply: 'Vacunación incompleta.' }] };
  assert.equal(isVaccinationCardRequest('¿Tiene el carné?'), true);
  assert.equal(isVaccinationCardRequest('¿Está vacunado?'), false);
  assert.equal(vaccinationCard(data), null);
  assert.match(structured(data, '¿Me muestra el carné?'), /No traje el carné/);
  assert.deepEqual(vaccinationCard(vaccine), { summary: 'Le faltan algunas vacunas.', doses: [] });
  const dose = { vaccine: 'Triple viral (sarampión, rubéola y paperas)', dose: 'Primera dosis', date: '2025-03-07' };
  const recorded = { ...data, vaccinationCard: { summary: '', doses: [dose] } };
  assert.equal(validCase(recorded, rubric), true);
  assert.equal(validCase({ ...recorded, vaccinationCard: { summary: '', doses: [{ ...dose, date: '2025-02-31' }] } }, rubric), false);
  assert.deepEqual(vaccinationCard(recorded), recorded.vaccinationCard);
  assert.match(structured(recorded, '¿Tiene la vacuna contra el sarampión?'), /Triple viral/);
});

test('la anamnesis encadena detalles del síntoma, otros síntomas y medicamentos', () => {
  const currentCase = { scenario: 'Paciente simulado de 7 años.', opening: 'Le salió un sarpullido.', interactions: [
    { group: 'anamnesis', label: 'Inicio y curso', reply: 'El brote empezó ayer en la cara.' },
    { group: 'anamnesis', label: 'Síntomas asociados', reply: 'Tuvo fiebre anoche.' },
    { group: 'anamnesis', label: 'Tratamiento', reply: 'Antes tomaba hierro. Hoy tomó paracetamol.' },
    { group: 'anamnesis', label: 'Antecedentes familiares', reply: 'Su papá tiene asma.' },
    { group: 'anamnesis', label: 'Hospitalizaciones previas', reply: 'Estuvo hospitalizado por una infección.' },
    { group: 'exploracion', label: 'Piel y ganglios', reply: 'Se ven manchas rojizas en el tronco. Adenopatías detrás de las orejas.' },
  ] };
  const question = '¿Cómo es el sarpullido?';
  assert.equal(structured(currentCase, question), 'Se ven manchas rojizas en el tronco.');
  assert.equal(structured(currentCase, '¿Dónde empezó?', [{ question }]), 'El brote empezó ayer en la cara.');
  assert.equal(structured(currentCase, '¿Dónde tiene las adenopatías?'), 'Adenopatías detrás de las orejas.');
  assert.equal(structured(currentCase, '¿Tiene algún otro síntoma?'), 'Tuvo fiebre anoche.');
  assert.equal(structured(currentCase, '¿Ya ha estado hospitalizado?'), 'Estuvo hospitalizado por una infección.');
  assert.equal(structured(currentCase, '¿Tiene antecedentes familiares?'), 'Su papá tiene asma.');
  assert.equal(structured(currentCase, 'En la revisión por sistemas, ¿algo más?', [{ question: '¿Tiene fiebre?', reply: 'Tuvo fiebre anoche.' }]),
    'Por ahora, eso es lo que más me preocupa.');
  const medication = { question: '¿Toma medicamentos?' };
  assert.equal(structured(currentCase, 'Por los de antes', [medication]), 'Antes tomaba hierro.');
  assert.equal(structured(currentCase, 'Por los de hoy', [medication, { question: 'Por los de antes' }]), 'Hoy tomó paracetamol.');
  assert.equal(structured(currentCase, '¿El niño juega o practica algún deporte?'), 'Cuando se siente bien, suele jugar en casa.');
  const pain = { ...currentCase, opening: 'Tiene dolor en el pecho.', interview: [
    { question: '¿Dónde siente el dolor?', reply: 'Me señala el lado izquierdo del pecho.' },
    { question: '¿Qué pasa si se acuesta?', reply: 'Me dice que le duele más cuando se acuesta.' },
  ] };
  assert.equal(structured(pain, '¿En qué parte le duele?'), 'Me señala el lado izquierdo del pecho.');
  assert.equal(structured(pain, '¿Qué pasa si se acuesta?'), 'Me dice que le duele más cuando se acuesta.');
  const vomiting = { ...currentCase, opening: 'Vomita desde ayer.', interactions: [
    { group: 'anamnesis', label: 'Número de vómitos', reply: 'Fueron cuatro episodios.' },
    { group: 'anamnesis', label: 'Aspecto del vómito', reply: 'Eran restos de comida, sin sangre.' },
  ] };
  assert.equal(structured(vomiting, '¿Desde hace cuánto está así?'), 'Vomita desde ayer.');
  assert.match(structured(vomiting, '¿Cómo son los vómitos y cuántos fueron?'), /cuatro episodios.*restos de comida/);
  assert.match(structured(vomiting, '¿Cuántos?', [{ question: '¿Cómo son los vómitos?' }]), /cuatro episodios/);
  assert.match(structured({ ...vomiting, interactions: [] }, '¿Cuántos vómitos ha tenido?'), /No alcancé a contar/);
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

test('Worker conserva el tiempo en pausa y registra una sola evolución con su siguiente decisión', async () => {
  const { id: caseId, data, rubric } = example[0];
  const original = addDiagnosticChoices(caseId, data, rubric, (items) => items);
  let session = { uid: 'student', index: 0, deadline: Date.now() + 20_000, caseIds: [caseId], createdAt: new Date().toISOString() };
  let result;
  const db = {
    async get(path) {
      if (path.startsWith('authorized_emails/')) return { data: { active: true } };
      if (path.startsWith('simulation_sessions/')) return { updateTime: 'edition', data: session };
      if (path.startsWith('private_sessions/')) return { data: { cases: [original] } };
      throw new ApiError(404, 'No existe.');
    },
    write(path, data, precondition) { return { path, data, precondition }; },
    progress() { return {}; },
    async commit(writes) {
      assert.deepEqual(writes[0].precondition, { updateTime: 'edition' });
      session = writes[0].data;
      if (writes[1]) result = writes[1].data;
    },
  };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => db });
  const post = (action, data = {}) => app(call('/circuits/circuit-id/' + action, { index: 0, ...data }), {});
  const frozen = await (await post('pause')).json();
  assert.ok(frozen.pausedRemaining < 20_001 && frozen.pausedRemaining > 0);
  assert.equal((await post('dialogue', { question: '¿Tiene tos?' })).status, 409);
  assert.equal((await post('submit', { selections: [] })).status, 409);
  session.deadline = Date.now() - 100_000;
  const resumed = await (await post('resume')).json();
  assert.equal(resumed.deadline - resumed.serverNow, frozen.pausedRemaining);
  assert.equal(resumed.pausedRemaining, null);
  const action = data.interactions.find((item) => item.group === 'acciones' && item.id !== rubric.criteria.find(({ domain }) => domain === 3).id).id;
  const correct = rubric.criteria.find(({ domain }) => domain === 3).id;
  const branch = await (await post('evolution', { action })).json();
  assert.equal(branch.action, action);
  assert.ok(branch.findings.length);
  assert.equal(branch.expected, undefined);
  assert.deepEqual(await (await post('evolution', { action })).json(), branch);
  assert.equal((await post('evolution', { action: correct })).status, 409);
  const selections = rubric.criteria.map(({ id }) => id);
  assert.equal((await post('submit', { selections, differentials: [selections[0]] })).status, 400);
  assert.equal((await post('submit', { selections, differentials: original.rubric.differentials,
    justification: '  La edad y el patrón de síntomas.  ', followUp: 'escalar' })).status, 200);
  assert.equal(result.justification, 'La edad y el patrón de síntomas.');
  assert.deepEqual(result.followUp, { expected: 'Escalar la atención', chosen: 'Escalar la atención' });
  assert.equal(result.domains[3], 0);
  assert.equal(result.domains[2], 20);
  assert.equal(session.evolution, undefined);
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
  assert.match(messages[0].content, /relatoInicial/);
  assert.ok(!messages[0].content.includes(example[0].rubric.reference));
});

test('la conversación abierta usa la IA incluso cuando existe una respuesta estructurada', async () => {
  const data = { ...example[0].data, scenario: 'Paciente simulado de 8 años.', opening: 'Me da miedo hablar.', interactions: [],
    interview: [{ question: '¿Con quién vives?', reply: 'Vivo con mi mamá y mi papá.' },
      { question: '¿Con quién no te sientes seguro?', reply: 'Con mi papá. A veces me pega.' }] };
  const database = { async get(path) {
    if (path.startsWith('authorized_emails/')) return { data: { active: true } };
    if (path.startsWith('simulation_sessions/')) return { data: { uid: 'student', index: 0, deadline: Date.now() + 10000 } };
    return { data: { cases: [{ public: data }] } };
  } };
  const app = createHandler({ verify: async () => ({ uid: 'student', email: 'student@example.com' }), database: () => database });
  let input;
  let allowAI = true;
  const env = { AI_ENABLED: 'true', AI: { async run(_model, options) {
    input = options;
    return { response: 'Con mi mamá y mi papá. Me cuesta hablar si él está aquí.' };
  } }, LIMITS: { getByName: () => ({ fetch: async (_url, request) => new Response(null,
    { status: !allowAI && JSON.parse(request.body).action === 'dialogue' ? 429 : 204 }) }) } };
  const ask = async (question, history = []) => (await app(call('/circuits/circuit-id/dialogue', { question, history }), env)).json();
  const question = '¿Con quién vives?';
  const history = [{ question: '¿Quieres hablar a solas?', reply: 'Sí, así me siento mejor.' }];
  assert.deepEqual(await ask(question, history), { mode: 'ai', reply: 'Con mi mamá y mi papá. Me cuesta hablar si él está aquí.' });
  assert.deepEqual(input.messages.slice(1), [{ role: 'user', content: history[0].question },
    { role: 'assistant', content: history[0].reply }, { role: 'user', content: question }]);
  assert.match(input.messages[0].content, /"pistaParaResponder":"Vivo con mi mamá y mi papá\."/);
  assert.match(input.messages[0].content, /improvisar detalles cotidianos/);
  assert.match(input.messages[0].content, /sin dar por ocurrida una agresión/);
  allowAI = false;
  assert.deepEqual(await ask(question, history), { mode: 'structured', reply: 'Vivo con mi mamá y mi papá.' });
});

test('el listado de paraclínicos incluye informes con resultado y distingue los simulados', () => {
  const { data } = example[0];
  const item = { id: 'panel-especial', group: 'paraclinicos', label: 'Panel viral respiratorio', reply: 'Panel negativo.' };
  const station = { ...data, interactions: [...data.interactions, item] };
  const options = availableStudyOptions(station);
  assert.deepEqual(options.find(({ label }) => label === item.label), { id: 'stored:panel-especial', label: item.label, kind: 'case' });
  assert.deepEqual(requestedStudies(station, `Solicito ${item.label}`).documented, [item]);
  assert.equal(isStudyListRequest('Ajá, ¿qué paraclínicos hay?'), true);
  assert.equal(isStudyListRequest('¿Qué resultado dio el hemograma?'), false);
  for (const option of options) {
    const report = requestedStudies(station, `Solicito ${option.label}`);
    if (option.kind === 'case') assert.ok(report.documented.length || report.supplemental.some(({ kind }) => kind === 'case'));
    else assert.ok(report.supplemental.some(({ kind }) => kind === 'simulated'));
  }
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
