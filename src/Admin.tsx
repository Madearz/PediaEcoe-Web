import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardList, Plus, ShieldCheck, Trash2, Upload, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import { collection, count, doc, deleteDoc, getAggregateFromServer, getDocFromServer, getDocsFromServer, limit, orderBy,
  query, runTransaction, setDoc, sum, writeBatch } from 'firebase/firestore';
import { database } from './Student';
import { call, messageOf } from './firebase';
import { CURRICULAR_GROUPS, DAILY_CIRCUITS_DEFAULT, DAILY_CIRCUITS_MAX, GROUPS, normalizeEmail, readInvitations, validCase, validId, validStudyResults, type CaseData, type CurricularGroup, type Rubric, type StudyResult } from '../shared/clinical.mjs';
import { caseGroups } from '../shared/case-groups.mjs';
import { formatStudyResult, MISSING_STUDY_VALUE, stationStudySamples } from '../shared/studies.mjs';

const emptyCase: CaseData = { title: '', category: '', difficulty: 'Media', scenario: '', opening: '', status: 'draft', interactions: [], curricularGroups: [] };
const emptyRubric: Rubric = { diagnosis: '', reference: '', criteria: [], critical: [] };
type Invitation = { email: string; active: boolean };
type CircuitLimit = { email: string; dailyLimit: number };
type CaseItem = { id: string; title: string; status: CaseData['status']; curricularGroups: CurricularGroup[] };
type Stat = { students: number; submitted: number; circuits: number; total: number };
const statuses = { draft: 'Borrador', review: 'En revisión médica', published: 'Publicado' };

export function Admin({ user }: { user: User }) {
  const [tab, setTab] = useState<'invitations'|'cases'|'stats'>('invitations');
  return <main className="page"><div className="page-heading"><ShieldCheck/><div><h1>Administración</h1><p>Invitaciones, casos y seguimiento académico</p></div></div>
    <nav className="admin-tabs" aria-label="Administración">
      {([['invitations', 'Invitaciones'], ['cases', 'Banco de casos'], ['stats', 'Estadísticas']] as const).map(([key, title]) =>
        <button key={key} className={'button ' + (tab === key ? 'primary' : 'secondary')} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}
    </nav>
    {tab === 'invitations' ? <Invitations user={user}/> : tab === 'cases' ? <CaseEditor/> : <Statistics/>}
  </main>;
}

function Invitations({ user }: { user: User }) {
  const [rows, setRows] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState('');
  const [circuitLimits, setCircuitLimits] = useState<Record<string, number> | null>(null);
  const [limitError, setLimitError] = useState('');
  const [editingLimit, setEditingLimit] = useState<{ email: string; value: string } | null>(null);
  const addresses = collection(database, 'authorized_emails');
  async function refresh() {
    const snapshot = await getDocsFromServer(query(addresses, limit(1000)));
    setRows(snapshot.docs.map((item) => ({ email: item.id, active: item.data().active === true })));
  }
  useEffect(() => { void refresh().catch((failure) => setError(messageOf(failure))).finally(() => setBusy(false)); }, []);
  useEffect(() => {
    const request = new AbortController();
    void call<CircuitLimit[]>(user, '/admin/circuit-limits', undefined, request.signal)
      .then((items) => setCircuitLimits(Object.fromEntries(items.map(({ email, dailyLimit }) => [email, dailyLimit]))))
      .catch((failure) => { if (!request.signal.aborted) setLimitError(messageOf(failure)); });
    return () => request.abort();
  }, [user]);
  async function mutate(operation: () => Promise<string>) {
    setBusy(true);
    setNotice('');
    setError('');
    try { setNotice(await operation()); await refresh(); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    const address = normalizeEmail(email);
    if (!address) { setError('Escribe un correo válido.'); return; }
    void mutate(async () => {
      await setDoc(doc(addresses, address), { active: true });
      setEmail('');
      return 'Invitación activa.';
    });
  }
  function upload(file: File) {
    void mutate(async () => {
      if (file.size > 120_000) throw new Error('El CSV supera el tamaño permitido.');
      const list = readInvitations(await file.text());
      let added = 0;
      for (let offset = 0; offset < list.length; offset += 30) {
        const group = list.slice(offset, offset + 30).map((address) => doc(addresses, address));
        try {
          added += await runTransaction(database, async (transaction) => {
            const snapshots = await Promise.all(group.map((item) => transaction.get(item)));
            const newRows = snapshots.filter((item) => !item.exists());
            newRows.forEach((item) => transaction.set(item.ref, { active: true }));
            return newRows.length;
          });
        } catch {
          await refresh().catch(() => null);
          throw new Error(`Se agregaron ${added} invitaciones antes del error. Puedes volver a importar el mismo archivo.`);
        }
      }
      return `Invitaciones nuevas: ${added}. Ya registradas: ${list.length - added}.`;
    });
  }
  async function saveLimit(event: FormEvent, editor: { email: string; value: string }) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const saved = await call<CircuitLimit>(user, '/admin/circuit-limits', { email: editor.email, dailyLimit: Number(editor.value) });
      setCircuitLimits((previous) => ({ ...previous, [saved.email]: saved.dailyLimit }));
      setEditingLimit(null);
      setNotice(`Cupo guardado para ${saved.email}. Puede iniciar hasta ${saved.dailyLimit} circuitos al día.`);
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <section className="card admin-section"><h2><Users size={21}/> Correos autorizados</h2>
    <form onSubmit={add} className="inline-form"><label>Correo de Google<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="estudiante@universidad.edu"/></label>
      <button className="button primary" disabled={busy}><Plus size={17}/> Autorizar</button>
      <label className="button secondary upload"><Upload size={17}/> Importar CSV<input type="file" accept=".csv,text/csv" disabled={busy}
        onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) upload(file); }}/></label>
    </form>
    <p>El CSV debe tener una columna de correos y puede incluir el encabezado «correo».</p>
    {limitError && <p className="notice error" role="alert">No se pudieron cargar los cupos. {limitError}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="notice error" role="alert">{error}</p>}
    <ul className="admin-list">{rows.map((item) => {
      const own = item.email === user.email?.toLowerCase();
      const dailyLimit = circuitLimits?.[item.email] ?? DAILY_CIRCUITS_DEFAULT;
      const editor = editingLimit?.email === item.email ? editingLimit : null;
      return <li key={item.email}><span><b>{item.email}</b><small>{own ? 'Tu cuenta · ' : ''}{item.active ? 'Autorizada' : 'Suspendida'}
        {circuitLimits && ` · ${dailyLimit} circuitos al día`}</small></span>
        {circuitLimits && (editor ? <form className="circuit-limit-form" onSubmit={(event) => void saveLimit(event, editor)}>
          <label>Circuitos al día<input type="number" min={DAILY_CIRCUITS_DEFAULT} max={DAILY_CIRCUITS_MAX} step={1} required
            aria-label={`Circuitos al día para ${item.email}`} value={editor.value} disabled={busy}
            onChange={(event) => setEditingLimit({ ...editor, value: event.target.value })}/></label>
          <button className="button primary" disabled={busy}>Guardar</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setEditingLimit(null)}>Cancelar</button>
        </form> : <button type="button" className="button secondary" disabled={busy}
          aria-label={`Cambiar cupo de ${item.email}`} onClick={() => setEditingLimit({ email: item.email, value: String(dailyLimit) })}>Cambiar cupo</button>)}
        {!own && (pendingDelete === item.email ? <div><button className="button danger" disabled={busy} onClick={() => void mutate(async () => {
          await deleteDoc(doc(addresses, item.email)); setPendingDelete(''); return 'Invitación eliminada.';
        })}>Confirmar eliminación</button><button className="button secondary" onClick={() => setPendingDelete('')}>Cancelar</button></div> :
          <div><button className="button secondary" disabled={busy} onClick={() => void mutate(async () => {
            await setDoc(doc(addresses, item.email), { active: !item.active }); return item.active ? 'Acceso suspendido.' : 'Acceso reactivado.';
          })}>{item.active ? 'Suspender' : 'Reactivar'}</button><button className="icon-button" title="Eliminar invitación" aria-label={'Eliminar ' + item.email} disabled={busy} onClick={() => setPendingDelete(item.email)}><Trash2 size={18}/></button></div>)}
      </li>;
    })}</ul>
    {busy && <p role="status">Procesando invitaciones…</p>}
  </section>;
}

function CaseEditor() {
  const [rows, setRows] = useState<CaseItem[]>([]);
  const [selected, setSelected] = useState('');
  const [draftId, setDraftId] = useState('');
  const [data, setData] = useState<CaseData>(emptyCase);
  const [rubric, setRubric] = useState<Rubric>(emptyRubric);
  const [structure, setStructure] = useState('[]');
  const [criteria, setCriteria] = useState('[]');
  const [critical, setCritical] = useState('[]');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [remove, setRemove] = useState(false);
  const studies = data.studyResults ?? [];
  const existingStudies = [
    ...data.interactions.filter((item) => item.group === 'paraclinicos').map(({ id, label, reply }) => ({
      id, label, value: reply, unit: '', reference: '',
    })),
    ...stationStudySamples(data, selected),
  ].filter((item) => !studies.some((study) => study.id === item.id || study.label.toLowerCase() === item.label.toLowerCase()));
  function updateStudy(row: StudyResult) {
    setData((current) => ({ ...current, studyResults: (current.studyResults ?? []).map((item) => item.id === row.id ? row : item) }));
  }
  function addStudy(row: StudyResult) {
    setData((current) => ({ ...current, studyResults: [...(current.studyResults ?? []), row] }));
  }
  const reset = (next: CaseData, scoring: Rubric) => {
    setData(next);
    setRubric(scoring);
    setStructure(JSON.stringify(next.interactions, null, 2));
    setCriteria(JSON.stringify(scoring.criteria, null, 2));
    setCritical(JSON.stringify(scoring.critical, null, 2));
    setReviewed(false);
    setRemove(false);
  };
  async function list() {
    const snapshot = await getDocsFromServer(query(collection(database, 'case_bank'), orderBy('title'), limit(400)));
    setRows(await Promise.all(snapshot.docs.map(async (item) => {
      const { title, status, curricularGroups } = item.data() as CaseData;
      return { id: item.id, title, status, curricularGroups: await caseGroups(item.id, curricularGroups) };
    })));
  }
  useEffect(() => { void list().catch((failure) => setError(messageOf(failure))).finally(() => setBusy(false)); }, []);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setNote(''); setError('');
    try { await operation(); } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  function open(id: string) {
    void run(async () => {
      if (!id) { setSelected(''); setDraftId(''); reset(emptyCase, emptyRubric); return; }
      const [item, hidden] = await Promise.all([getDocFromServer(doc(database, 'case_bank', id)), getDocFromServer(doc(database, 'case_rubrics', id))]);
      if (!item.exists()) throw new Error('El caso no está disponible.');
      setSelected(id);
      setDraftId(id);
      const current = item.data() as CaseData;
      const scoring = hidden.exists() ? hidden.data() as Rubric : emptyRubric;
      reset({ ...current, curricularGroups: await caseGroups(id, current.curricularGroups, scoring.reference) }, scoring);
    });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!validId(draftId)) throw new Error('Usa un identificador corto con letras minúsculas, números o guiones.');
      let current: CaseData;
      let scoring: Rubric;
      try {
        current = { ...data, interactions: JSON.parse(structure) };
        scoring = { ...rubric, criteria: JSON.parse(criteria), critical: JSON.parse(critical) };
      } catch { throw new Error('Revisa el formato JSON de interacciones, criterios y errores críticos.'); }
      if (current.studyResults && (!validStudyResults(current.studyResults)
          || current.studyResults.some((item) => formatStudyResult(item) === MISSING_STUDY_VALUE))) {
        throw new Error('Revisa los paraclínicos. Escribe el resultado de cada estudio y, para resultados cuantitativos, el valor numérico.');
      }
      if (!validCase(current, scoring)) throw new Error('Revisa que todas las opciones tengan un identificador distinto, que las decisiones tengan al menos dos opciones y que los dominios sumen 20, 20, 20, 25 y 15.');
      if (current.status === 'published' && !reviewed) throw new Error('Confirma la revisión médica para publicar esta versión.');
      const item = doc(database, 'case_bank', draftId);
      await runTransaction(database, async (transaction) => {
        if (!selected && (await transaction.get(item)).exists()) throw new Error('Ya existe un caso con ese identificador.');
        transaction.set(item, current);
        transaction.set(doc(database, 'case_rubrics', draftId), scoring);
      });
      setSelected(draftId);
      await list();
      setNote('Caso guardado.');
    });
  }
  function seed(file: File) {
    void run(async () => {
      if (file.size > 1_500_000) throw new Error('El archivo supera el tamaño permitido.');
      const cases = JSON.parse(await file.text()) as { id: string; data: CaseData; rubric: Rubric }[];
      if (!Array.isArray(cases) || !cases.length || cases.length > 200
        || !cases.every((item) => item && validId(item.id) && validCase(item.data, item.rubric))
        || new Set(cases.map((item) => item.id)).size !== cases.length) {
        throw new Error('El archivo debe contener entre 1 y 200 borradores válidos con identificadores únicos.');
      }
      let imported = 0;
      for (let offset = 0; offset < cases.length; offset += 20) {
        const group = cases.slice(offset, offset + 20);
        const groups = await Promise.all(group.map((item) => caseGroups(item.id, item.data.curricularGroups, item.rubric.reference)));
        try {
          imported += await runTransaction(database, async (transaction) => {
            const records = await Promise.all(group.map((item) => transaction.get(doc(database, 'case_bank', item.id))));
            let added = 0;
            records.forEach((record, index) => {
              if (record.exists()) return;
              const item = group[index];
              transaction.set(record.ref, { ...item.data, status: 'review', curricularGroups: groups[index] });
              transaction.set(doc(database, 'case_rubrics', item.id), item.rubric);
              added++;
            });
            return added;
          });
        } catch {
          await list().catch(() => null);
          throw new Error(`Se guardaron ${imported} borradores antes del error. Puedes importar otra vez el mismo archivo.`);
        }
      }
      await list();
      setNote(`${imported} borradores en revisión médica. ${cases.length - imported} casos existentes conservados.`);
    });
  }
  return <section className="card admin-section"><h2><ClipboardList size={21}/> Gestión del banco</h2>
    <div className="inline-form"><label>Caso guardado<select disabled={busy} value={selected} onChange={(event) => open(event.target.value)}>
      <option value="">Crear un caso</option>{rows.map((item) => <option key={item.id} value={item.id}>
        {[item.title, statuses[item.status], ...item.curricularGroups.map((group) => `Grupo ${group}`)].join(' · ')}
      </option>)}
    </select></label><label className="button secondary upload"><Upload size={17}/> Importar casos JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) seed(file); }}/></label></div>
    {error && <p className="notice error" role="alert">{error}</p>}{note && <p className="notice" role="status">{note}</p>}
    <form className="case-form" onSubmit={save}>
      <label>Identificador<input required maxLength={64} disabled={Boolean(selected)} value={draftId} onChange={(event) => setDraftId(event.target.value)}/></label>
      <label>Título<input required maxLength={110} value={data.title} onChange={(event) => setData({ ...data, title: event.target.value })}/></label>
      <label>Categoría<input required maxLength={80} value={data.category} onChange={(event) => setData({ ...data, category: event.target.value })}/></label>
      <fieldset className="curricular-groups">
        <legend>Grupos curriculares</legend>
        {CURRICULAR_GROUPS.map((group) => <label className="checkbox" key={group}>
          <input type="checkbox" checked={data.curricularGroups?.includes(group) ?? false} onChange={(event) => {
            const selectedGroups = data.curricularGroups ?? [];
            const curricularGroups = event.target.checked ? [...selectedGroups, group] : selectedGroups.filter((entry) => entry !== group);
            setData({ ...data, curricularGroups });
          }}/> Grupo {group}
        </label>)}
      </fieldset>
      <label>Dificultad<select value={data.difficulty} onChange={(event) => setData({ ...data, difficulty: event.target.value as CaseData['difficulty'] })}>
        <option>Baja</option><option>Media</option><option>Alta</option></select></label>
      <label>Estado<select value={data.status} onChange={(event) => setData({ ...data, status: event.target.value as CaseData['status'] })}>
        {Object.entries(statuses).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <label>Diagnóstico esperado<input required maxLength={200} value={rubric.diagnosis} onChange={(event) => setRubric({ ...rubric, diagnosis: event.target.value })}/></label>
      <label className="wide">Escenario<textarea required maxLength={750} value={data.scenario} onChange={(event) => setData({ ...data, scenario: event.target.value })}/></label>
      <label className="wide">Frase inicial del familiar<textarea required maxLength={750} value={data.opening} onChange={(event) => setData({ ...data, opening: event.target.value })}/></label>
      <fieldset className="wide study-editor">
        <legend>Paraclínicos</legend>
        {studies.map((item) => <div className="study-editor-row" key={item.id}>
          <label>Nombre del estudio<input required maxLength={120} value={item.label} onChange={(event) => updateStudy({ ...item, label: event.target.value })}/></label>
          <label>Resultado<input required maxLength={260} value={item.value} placeholder="Ej. 9,6" onChange={(event) => updateStudy({ ...item, value: event.target.value })}/></label>
          <label>Unidad<input maxLength={40} value={item.unit} placeholder="Ej. g/dL" onChange={(event) => updateStudy({ ...item, unit: event.target.value })}/></label>
          <label>Rango de referencia (opcional)<input maxLength={120} value={item.reference} onChange={(event) => updateStudy({ ...item, reference: event.target.value })}/></label>
          <button type="button" className="button secondary" disabled={busy} aria-label={`Quitar edición de ${item.label || 'estudio'}`}
            onClick={() => setData((current) => ({ ...current, studyResults: (current.studyResults ?? []).filter(({ id }) => id !== item.id) }))}>Quitar edición</button>
        </div>)}
        <button type="button" className="button secondary" disabled={busy || studies.length >= 24} onClick={() => addStudy({
          id: 'lab-' + crypto.randomUUID(), label: '', value: '', unit: '', reference: '',
        })}><Plus size={16}/> Agregar paraclínico</button>
        {!!existingStudies.length && <details>
          <summary>Resultados existentes</summary>
          <ul className="study-existing">{existingStudies.map((item) => <li key={item.id}>
            <span><strong>{item.label}</strong><small>{item.value || 'Sin resultado consignado.'}</small></span>
            <button type="button" className="button secondary" disabled={busy || studies.length >= 24} onClick={() => {
              const value = formatStudyResult(item);
              addStudy({ ...item, value: value === MISSING_STUDY_VALUE ? '' : value });
            }}>Usar como base</button>
          </li>)}</ul>
        </details>}
      </fieldset>
      <label className="wide">Interacciones JSON<textarea rows={8} spellCheck={false} value={structure} onChange={(event) => setStructure(event.target.value)}/>
        <small>{'{ id, group, label, reply }'} · {GROUPS.join(', ')}</small></label>
      <label>Criterios JSON<textarea rows={6} spellCheck={false} value={criteria} onChange={(event) => setCriteria(event.target.value)}/>
        <small>{'{ id, domain, points, tip }'} · dominios del 0 al 4</small></label>
      <label>Errores críticos JSON<textarea rows={6} spellCheck={false} value={critical} onChange={(event) => setCritical(event.target.value)}/><small>{'{ id, tip }'}</small></label>
      <label className="wide">Referencia de estudio<input required maxLength={300} value={rubric.reference} onChange={(event) => setRubric({ ...rubric, reference: event.target.value })}/></label>
      {data.status === 'published' && <label className="wide checkbox"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/> Confirmo la revisión médica del caso y su rúbrica.</label>}
      <div className="wide action-row"><button className="button primary" disabled={busy}>Guardar caso</button>
        {selected && !remove && <button type="button" className="button secondary" onClick={() => setRemove(true)}>Eliminar caso</button>}
        {selected && remove && <><button type="button" className="button danger" disabled={busy} onClick={() => void run(async () => {
          const batch = writeBatch(database);
          batch.delete(doc(database, 'case_bank', selected));
          batch.delete(doc(database, 'case_rubrics', selected));
          await batch.commit();
          setSelected(''); setDraftId(''); reset(emptyCase, emptyRubric); await list(); setNote('Caso eliminado.');
        })}>Confirmar eliminación</button><button type="button" className="button secondary" onClick={() => setRemove(false)}>Cancelar</button></>}
      </div>
    </form>
  </section>;
}

function Statistics() {
  const [stat, setStat] = useState<Stat | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      getAggregateFromServer(collection(database, 'users'), { students: count() }),
      getAggregateFromServer(collection(database, 'student_progress'), { submitted: sum('stations'), circuits: sum('circuits'), total: sum('totalScore') }),
    ]).then(([users, progress]) => setStat({ ...users.data(), ...progress.data() }))
      .catch((failure) => setError(messageOf(failure)));
  }, []);
  return <section className="card admin-section"><h2>Resumen general</h2>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!stat && !error && <p role="status">Cargando estadísticas…</p>}
    {stat && <div className="metric-row"><div><strong>{stat.students}</strong>Perfiles registrados</div><div><strong>{stat.circuits}</strong>Circuitos completados</div>
      <div><strong>{stat.submitted}</strong>Estaciones evaluadas</div><div><strong>{stat.submitted ? (stat.total / stat.submitted).toFixed(1) : '0'}/100</strong>Puntaje promedio</div></div>}
  </section>;
}
