import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

let environment;
const identities = {
  admin: 'admin@example.com',
  student: 'student@example.com',
  other: 'other@example.com',
  unknown: 'unknown@example.com',
};
const claims = (email, provider = 'google.com', verified = true) => ({
  email, email_verified: verified, firebase: { sign_in_provider: provider },
});
const as = (uid, token = claims(identities[uid])) => environment.authenticatedContext(uid, token).firestore();
const ref = (db, path) => doc(db, path);
const get = (db, path) => getDocFromServer(ref(db, path));

function clearConditionally(email, data) {
  return environment.withSecurityRulesDisabled(async (context) => setDoc(ref(context.firestore(), 'authorized_emails/' + email), data));
}

before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-pediaecoe', firestore: {
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  } });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const key of ['admin', 'student', 'other']) await setDoc(ref(db, 'authorized_emails/' + identities[key]), { active: true });
    await Promise.all([
      setDoc(ref(db, 'admins/admin'), {}),
      setDoc(ref(db, 'users/other'), { email: identities.other }),
      setDoc(ref(db, 'case_bank/draft'), { status: 'draft' }),
      setDoc(ref(db, 'case_bank/published'), { status: 'published' }),
      setDoc(ref(db, 'case_rubrics/published'), { diagnosis: 'privado' }),
      setDoc(ref(db, 'simulation_sessions/first'), { uid: 'student', index: 0 }),
      setDoc(ref(db, 'station_results/first'), { uid: 'student', score: 74 }),
      setDoc(ref(db, 'station_results/second'), { uid: 'other', score: 82 }),
      setDoc(ref(db, 'student_progress/student'), { stations: 1 }),
      setDoc(ref(db, 'private_sessions/first'), { cases: [] }),
    ]);
  });
});
after(async () => { await environment?.cleanup(); });

test('bloquea anónimos, cuentas sin invitación y credenciales sin Google verificado', async () => {
  const databases = [environment.unauthenticatedContext().firestore(), as('unknown'),
    as('student', claims(identities.student, 'password')), as('student', claims(identities.student, 'google.com', false))];
  for (const db of databases) {
    await assertFails(get(db, 'case_bank/published'));
    await assertFails(get(db, 'station_results/first'));
    await assertFails(get(db, 'student_progress/student'));
  }
  const absence = await assertSucceeds(get(as('unknown'), 'authorized_emails/' + identities.unknown));
  assert.equal(absence.exists(), false);
  await assertFails(get(as('unknown'), 'authorized_emails/' + identities.student));
});

test('consulta solo UID propio y casos publicados, con filtros obligatorios', async () => {
  const db = as('student', claims('STUDENT@EXAMPLE.COM'));
  await assertSucceeds(get(db, 'simulation_sessions/first'));
  await assertSucceeds(get(db, 'student_progress/student'));
  await assertSucceeds(get(db, 'station_results/first'));
  await assertFails(get(db, 'station_results/second'));
  await assertFails(get(db, 'users/other'));
  await assertFails(get(db, 'case_bank/draft'));
  await assertFails(get(db, 'case_rubrics/published'));
  await assertFails(get(db, 'private_sessions/first'));
  const owned = await assertSucceeds(getDocsFromServer(query(collection(db, 'station_results'), where('uid', '==', 'student'))));
  assert.equal(owned.size, 1);
  await assertFails(getDocsFromServer(collection(db, 'station_results')));
  await assertFails(getDocsFromServer(collection(db, 'case_bank')));
  assert.equal((await assertSucceeds(getDocsFromServer(query(collection(db, 'case_bank'), where('status', '==', 'published'))))).size, 1);
});

test('impide ascenso a administradora y escritura de calificaciones o progreso', async () => {
  const db = as('student');
  const fields = { email: identities.student, name: 'Estudiante', photo: '', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref(db, 'users/student'), fields));
  await assertSucceeds(updateDoc(ref(db, 'users/student'), { name: 'Estudiante de prueba' }));
  await assertFails(updateDoc(ref(db, 'users/student'), { role: 'admin' }));
  await assertFails(setDoc(ref(db, 'admins/student'), {}));
  await assertFails(setDoc(ref(db, 'authorized_emails/' + identities.unknown), { active: true }));
  await assertFails(updateDoc(ref(db, 'station_results/first'), { score: 100 }));
  await assertFails(setDoc(ref(db, 'station_results/fake'), { uid: 'student', score: 100 }));
  await assertFails(updateDoc(ref(db, 'student_progress/student'), { stations: 500 }));
  await assertFails(updateDoc(ref(db, 'simulation_sessions/first'), { index: 3 }));
  await assertFails(deleteDoc(ref(db, 'station_results/first')));
});

test('administradora invita y revoca, sin otorgarse roles ni editar puntajes por cliente', async () => {
  const admin = as('admin');
  const student = as('student');
  await assertSucceeds(get(admin, 'case_rubrics/published'));
  await assertSucceeds(setDoc(ref(admin, 'case_bank/new'), { status: 'review' }));
  await assertSucceeds(getDocsFromServer(collection(admin, 'users')));
  await assertFails(setDoc(ref(admin, 'admins/student'), {}));
  await assertFails(updateDoc(ref(admin, 'station_results/first'), { score: 100 }));
  await assertFails(updateDoc(ref(admin, 'authorized_emails/' + identities.admin), { active: false }));
  await assertSucceeds(setDoc(ref(admin, 'authorized_emails/test+tag@example.com'), { active: true }));
  await assertSucceeds(deleteDoc(ref(admin, 'authorized_emails/test+tag@example.com')));
  try {
    await assertSucceeds(updateDoc(ref(admin, 'authorized_emails/' + identities.student), { active: false }));
    assert.equal((await assertSucceeds(get(student, 'authorized_emails/' + identities.student))).data().active, false);
    await assertFails(get(student, 'station_results/first'));
    await assertFails(get(student, 'case_bank/published'));
    await assertSucceeds(deleteDoc(ref(admin, 'authorized_emails/' + identities.student)));
    await assertFails(get(student, 'simulation_sessions/first'));
  } finally {
    await clearConditionally(identities.student, { active: true });
  }
});

test('Firestore REST aplica verificación de carrera y crea el contador con una transformación', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const root = 'projects/demo-pediaecoe/databases/(default)/documents';
  const base = 'http://' + host + '/v1/' + root;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const path = 'authorized_emails/' + identities.student;
  const invitation = await (await fetch(base + '/' + path, { headers })).json();
  const writes = [
    { verify: invitation.name, currentDocument: { updateTime: invitation.updateTime } },
    { transform: { document: root + '/student_progress/rest-test', fieldTransforms: [
      { fieldPath: 'stations', increment: { integerValue: '1' } },
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ] } },
  ];
  const commit = () => fetch(base + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes }) });
  const initial = await commit();
  assert.equal(initial.status, 200, await initial.text());
  await clearConditionally(identities.student, { active: false });
  try {
    assert.notEqual((await commit()).status, 200);
    const record = await (await fetch(base + '/student_progress/rest-test', { headers })).json();
    assert.equal(record.fields.stations.integerValue, '1');
  } finally {
    await clearConditionally(identities.student, { active: true });
  }
});

test('el bloque de importación guarda 20 borradores y sus rúbricas sin exponerlos a estudiantes', async () => {
  const admin = as('admin');
  const student = as('student');
  const cases = Array.from({ length: 20 }, (_, index) => ref(admin, 'case_bank/import-' + index));
  await assertSucceeds(runTransaction(admin, async (transaction) => {
    const snapshots = await Promise.all(cases.map((item) => transaction.get(item)));
    for (const snapshot of snapshots) {
      assert.equal(snapshot.exists(), false);
      transaction.set(snapshot.ref, { status: 'review' });
      transaction.set(ref(admin, 'case_rubrics/' + snapshot.id), { diagnosis: 'rúbrica de prueba' });
    }
  }));
  const content = await assertSucceeds(get(admin, 'case_rubrics/import-19'));
  assert.equal(content.exists(), true);
  await assertFails(get(student, 'case_bank/import-19'));
  await assertFails(get(student, 'case_rubrics/import-19'));
});
