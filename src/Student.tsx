import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, BookOpen, BriefcaseMedical, CircleCheck, CircleAlert, Stethoscope } from 'lucide-react';
import type { User } from 'firebase/auth';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where,
  type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db, messageOf } from './firebase';
import { ReviewChat } from './ReviewChat';
import { Avatar } from './App';
import { CURRICULAR_GROUPS, DOMAINS, PHASES, type CaseData, type CurricularGroup, type Grade } from '../shared/clinical.mjs';
import { caseGroups } from '../shared/case-groups.mjs';
import { practiceFocus, PRACTICE_TIPS } from '../shared/learning.mjs';

export const database = db!;
export const pageSize = 12;
export const resultDate = (date: { toDate(): Date } | undefined) => date
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date.toDate()) : '';

export function Cases() {
  const [cases, setCases] = useState<(CaseData & { id: string; curricularGroups: CurricularGroup[] })[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const linkGroup = params.get('grupo');
  const category = params.get('tema');
  const group = linkGroup === 'A' || linkGroup === 'B' ? linkGroup : 'all';
  function setGroup(next: CurricularGroup | 'all') {
    setParams((current) => {
      const filters = new URLSearchParams(current);
      if (next === 'all') filters.delete('grupo');
      else filters.set('grupo', next);
      return filters;
    });
  }
  const inFlight = useRef(false);
  const visible = cases.filter((item) => (group === 'all' || item.curricularGroups.includes(group)) && (!category || item.category === category));
  const load = useCallback(async (next?: QueryDocumentSnapshot<DocumentData>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocsFromServer(query(collection(database, 'case_bank'), where('status', '==', 'published'),
        ...(next ? [startAfter(next)] : []), limit(pageSize)));
      const data = await Promise.all(snapshot.docs.map(async (item) => {
        const data = item.data() as CaseData;
        return { ...data, id: item.id, curricularGroups: await caseGroups(item.id, data.curricularGroups) };
      }));
      setCases((current) => next ? [...current, ...data] : data);
      setCursor(snapshot.size === pageSize ? snapshot.docs.at(-1)! : null);
    } catch (failure) { setError(messageOf(failure)); }
    finally { inFlight.current = false; setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if ((group !== 'all' || category) && !visible.length && cursor && !loading && !error) void load(cursor);
  }, [group, category, visible.length, cursor, loading, error, load]);
  return <main className="page">
    <div className="page-heading"><BriefcaseMedical/><div><h1>Banco de casos</h1><p>Escenarios pediátricos publicados</p></div></div>
    <nav className="admin-tabs case-filters" aria-label="Filtrar casos por grupo curricular">
      <button type="button" className={'button ' + (group === 'all' ? 'primary' : 'secondary')} aria-pressed={group === 'all'}
        onClick={() => setGroup('all')}>Todos</button>
      {CURRICULAR_GROUPS.map((entry) => <button type="button" key={entry}
        className={'button ' + (group === entry ? 'primary' : 'secondary')} aria-pressed={group === entry}
        onClick={() => setGroup(entry)}>Grupo {entry}</button>)}
    </nav>
    {category && <p className="notice">{category} · <Link to={group === 'all' ? '/casos' : `/casos?grupo=${group}`}>Quitar filtro de tema</Link></p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!loading && !error && !visible.length && !cursor && <p className="card">
      {category ? 'No hay casos publicados con estos filtros.' : group === 'all' ? 'Aún no hay casos publicados.' : `Aún no hay casos publicados del Grupo ${group}.`}
    </p>}
    <div className="card-grid">{visible.map((item) => <article className="card" key={item.id}>
      <span className="pill">{item.difficulty}</span><h2>{item.title}</h2>
      <p>{[item.category, ...item.curricularGroups.map((entry) => `Grupo ${entry}`)].join(' · ')}</p><p>{item.scenario}</p>
      <Link className="button secondary" aria-label={`Practicar ${item.title}`} to={`/simulador?caso=${encodeURIComponent(item.id)}`}>Practicar este caso</Link>
    </article>)}</div>
    {loading && <p role="status">Cargando casos…</p>}
    {cursor && <button className="button secondary" disabled={loading} onClick={() => void load(cursor)}>Cargar más casos</button>}
  </main>;
}

type GradeRecord = Grade & { createdAt?: { toDate(): Date }; id: string; station: number };
type Progress = { stations: number; circuits: number; totalScore: number };

function HistoryResult({ user, result }: { user: User; result: GradeRecord }) {
  const [open, setOpen] = useState(false);
  return <details className="card" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span><strong>{result.title}</strong><small>Estación {result.station + 1} · {resultDate(result.createdAt)}</small></span>
      <b className="pill">{result.score}/100</b></summary>
    {open && <><ReviewChat resultId={result.id} user={user} result={result}/><GradeDetail result={result}/></>}
  </details>;
}

export function GradeDetail({ result }: { result: Grade }) {
  return <div className="grade-detail">
    <div className="domain-grid">{PHASES.map((phase, index) => <div key={phase}><strong>{result.domains[index]}/{DOMAINS[index]}</strong><span>{phase}</span></div>)}</div>
    {!!result.critical.length && <div className="notice error"><strong>Errores críticos</strong><ul>{result.critical.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {!!result.errors?.length && <div><strong>Decisiones incorrectas</strong><ul>{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
    <p><strong>Diagnóstico esperado</strong><br/>{result.diagnosis}</p>
    {result.differentials && <div>
      <p><strong>Tus diagnósticos diferenciales</strong><br/>{result.differentials.chosen.join(' · ') || 'Sin diferenciales registrados.'}</p>
      {result.differentials.expected.length > 0 && <p><strong>Diferenciales considerados en la rúbrica</strong><br/>{result.differentials.expected.join(' · ')}</p>}
      {result.differentials.note && <p><strong>Cómo distinguirlos</strong><br/>{result.differentials.note}</p>}
    </div>}
    {result.justification && <p><strong>Tu justificación</strong><br/>{result.justification}</p>}
    {result.followUp && <p><strong>Seguimiento tras la evolución</strong><br/>Tu decisión: {result.followUp.chosen || 'Sin registrar'}. Decisión esperada: {result.followUp.expected}.</p>}
    <ul className="feedback">{result.feedback.map((item, index) => <li key={index}>{item.earned ? <CircleCheck size={19}/> : <CircleAlert size={19}/>}<span><b>{item.label}</b><small>{item.tip}</small></span></li>)}</ul>
    <p><strong>Referencia</strong><br/>{result.reference}</p>
  </div>;
}

function PracticeRecommendation({ results }: { results: GradeRecord[] }) {
  const focus = practiceFocus(results);
  const caseId = focus?.result?.caseId;
  const savedGroups = focus?.result?.curricularGroups;
  const [groups, setGroups] = useState<CurricularGroup[]>([]);
  useEffect(() => {
    let active = true;
    setGroups([]);
    if (caseId) void caseGroups(caseId, savedGroups)
      .then((value) => { if (active) setGroups(value); })
      .catch(() => {});
    return () => { active = false; };
  }, [caseId, savedGroups]);
  if (!focus) return null;
  const category = focus.result?.category;
  const bank = (group?: CurricularGroup) => {
    const filters = new URLSearchParams();
    if (group) filters.set('grupo', group);
    if (category) filters.set('tema', category);
    return '/casos' + (filters.size ? '?' + filters : '');
  };
  return <section className="card intro-card">
    <h2>Qué practicar después</h2>
    <p><strong>{PHASES[focus.index]}</strong> · {PRACTICE_TIPS[focus.index]}</p>
    <small>Según tus últimas {focus.sampleSize} {focus.sampleSize === 1 ? 'estación evaluada' : 'estaciones evaluadas'}.</small>
    <div className="option-list">
      {groups.length ? groups.map((group) => <Link key={group} className="button secondary" to={bank(group)}>Casos del Grupo {group}</Link>)
        : <Link className="button secondary" to={bank()}>{category ? 'Practicar más de este tema' : 'Abrir banco de casos'}</Link>}
      {caseId && <Link className="button secondary" to={`/simulador?caso=${encodeURIComponent(caseId)}`}>Repetir {focus.result?.title}</Link>}
    </div>
  </section>;
}

export function History({ user }: { user: User }) {
  const [results, setResults] = useState<GradeRecord[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load(next?: QueryDocumentSnapshot<DocumentData>) {
    setLoading(true);
    setError('');
    try {
      const [snapshot, summary] = await Promise.all([
        getDocsFromServer(query(collection(database, 'station_results'), where('uid', '==', user.uid),
          orderBy('createdAt', 'desc'), ...(next ? [startAfter(next)] : []), limit(pageSize))),
        next ? undefined : getDocFromServer(doc(database, 'student_progress', user.uid)),
      ]);
      const data = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as GradeRecord);
      setResults((current) => next ? [...current, ...data] : data);
      setCursor(snapshot.size === pageSize ? snapshot.docs.at(-1)! : null);
      if (summary) setProgress(summary.exists() ? summary.data() as Progress : null);
    } catch (failure) { setError(messageOf(failure)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [user.uid]);
  return <main className="page">
    <div className="page-heading"><BarChart3/><div><h1>Mis resultados</h1><p>Evaluaciones de práctica y progreso</p></div></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {progress && <div className="metric-row"><div className="card"><strong>{progress.circuits}</strong>Circuitos completados</div>
      <div className="card"><strong>{progress.stations}</strong>Estaciones evaluadas</div>
      <div className="card"><strong>{progress.stations ? (progress.totalScore / progress.stations).toFixed(1) : 0}/100</strong>Puntaje promedio</div></div>}
    <PracticeRecommendation results={results}/>
    {!loading && !error && !results.length && <p className="card">Completa una estación para ver tu primera evaluación aquí.</p>}
    <div className="result-list">{results.map((result) => <HistoryResult key={result.id} user={user} result={result}/>)}</div>
    {loading && <p role="status">Cargando resultados…</p>}
    {cursor && <button className="button secondary" disabled={loading} onClick={() => void load(cursor)}>Cargar más resultados</button>}
  </main>;
}

export function Profile({ user }: { user: User }) {
  return <main className="page"><div className="page-heading"><Stethoscope/><div><h1>Mi perfil</h1><p>Cuenta de Google y acceso</p></div></div>
    <section className="card profile"><Avatar user={user}/><div><h2>{user.displayName || 'Estudiante'}</h2><p>{user.email}</p>
      <span className="pill">Identidad verificada con Google</span></div></section>
  </main>;
}

export function Resources() {
  return <main className="page"><div className="page-heading"><BookOpen/><div><h1>Rúbricas y guías</h1><p>Criterios del simulador ECOE</p></div></div>
    <section className="card"><h2>Distribución de puntos</h2><ul className="rubric-list">{PHASES.map((phase, index) =>
      <li key={phase}>{phase}<strong>{DOMAINS[index]} puntos</strong></li>)}</ul>
      <p>La evaluación considera las preguntas clínicas registradas, la exploración y las decisiones seleccionadas. Una omisión o un error crítico aparece en la retroalimentación.</p></section>
    <section className="card"><h2>Recursos académicos</h2><p>Cada evaluación incluye la referencia del caso para repasar el tema. Los puntajes corresponden a práctica educativa.</p>
      <a href="https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/child-health/integrated-management-of-childhood-illness" target="_blank" rel="noreferrer">OMS · Atención integrada a las enfermedades prevalentes de la infancia</a></section>
  </main>;
}
