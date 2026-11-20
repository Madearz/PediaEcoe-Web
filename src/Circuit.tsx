import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, Brain, ClipboardList, Clock3, FileText, HeartPulse, Mic, MicOff, Send, Stethoscope, Volume2, VolumeX } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, doc, getDocFromServer, getDocsFromServer, orderBy, query, where, limit } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { apiReady, call, messageOf, RequestError } from './firebase';
import { database, GradeDetail } from './Student';
import { scene } from './App';
import { canSpeak, speak, useVoice } from './voice';
import { PHASES, SINGLE, STATION_MS, structured, type CaseData, type Grade, type Group, type Interaction } from '../shared/clinical.mjs';

type Session = { id: string; index: number; complete: boolean; case: CaseData | null; titles: string[]; deadline: number | null; serverNow: number };
type Turn = { question: string; reply: string; mode: 'structured'|'ai' };
type Existing = { id: string; index: number; complete: boolean };
const phases: Group[][] = [['anamnesis'], ['exploracion', 'paraclinicos'], ['razonamiento'], ['acciones'], ['cierre']];
const labels: Record<Group, string> = { anamnesis: 'Preguntas de anamnesis', exploracion: 'Exploración física',
  paraclinicos: 'Paraclínicos', razonamiento: 'Decisión diagnóstica', acciones: 'Conducta inicial', cierre: 'Comunicación y cierre' };

function Station({ user, session, onSaved }: { user: User; session: Session; onSaved: (resultId: string) => void }) {
  const station = session.case!;
  const deadline = session.deadline!;
  const storageKey = `pediaecoe:${user.uid}:${session.id}:${session.index}`;
  const [selected, setSelected] = useState<string[]>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]'); return Array.isArray(saved) ? saved.filter((id) => station.interactions.some((item) => item.id === id)) : []; }
    catch { return []; }
  });
  const [phase, setPhase] = useState(0);
  const [tool, setTool] = useState<Group>('exploracion');
  const [time, setTime] = useState(() => Math.max(0, deadline - session.serverNow));
  const [tab, setTab] = useState(false);
  const [finding, setFinding] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [audio, setAudio] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const expired = useRef(false);
  const voice = useVoice(setText);
  const latest = turns.at(-1);
  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const { resultId } = await call<{ resultId: string }>(user, '/circuits/' + session.id + '/submit', { index: session.index, selections: selected });
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
      onSaved(resultId);
    } catch (failure) { setError(messageOf(failure)); }
    finally { submitting.current = false; setSaving(false); }
  }, [onSaved, selected, session.id, session.index, storageKey, user]);
  useEffect(() => {
    const baseline = performance.now();
    const tick = () => setTime(Math.max(0, deadline - session.serverNow - (performance.now() - baseline)));
    const timer = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [deadline, session.serverNow]);
  useEffect(() => {
    if (time <= 0 && !expired.current) { expired.current = true; voice.stop(); void submit(); }
  }, [time, submit, voice.stop]);
  function choose(item: Interaction) {
    if (time <= 0 || saving) return;
    const previous = SINGLE.includes(item.group) ? selected.filter((id) => station.interactions.find((option) => option.id === id)?.group !== item.group) : selected;
    const next = [...new Set([...previous, item.id])];
    setSelected(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Progress can still be submitted. */ }
    if (!item.reply) return;
    if (item.group !== 'anamnesis') { setFinding(item.reply); return; }
    setTurns((current) => [...current.slice(-29), { question: item.label, reply: item.reply, mode: 'structured' }]);
    if (audio) speak(item.reply);
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (!question || sending || saving || !time) return;
    setSending(true);
    setError('');
    try {
      const answer = await call<Omit<Turn, 'question'>>(user, '/circuits/' + session.id + '/dialogue', { question });
      setText('');
      setTurns((current) => [...current.slice(-29), { question, ...answer }]);
      if (audio) speak(answer.reply);
    } catch (failure) {
      if (failure instanceof RequestError && [401, 403, 409].includes(failure.status)) {
        setError(messageOf(failure));
      } else {
        const reply = structured(station, question);
        setText('');
        setTurns((current) => [...current.slice(-29), { question, reply, mode: 'structured' }]);
        if (audio) speak(reply);
      }
    } finally { setSending(false); }
  }
  const totalSeconds = Math.ceil(time / 1000);
  const clock = [Math.floor(totalSeconds / 60), totalSeconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
  const centralGroup = phases[phase][0];
  const toolOptions = station.interactions.filter((item) => item.group === tool);
  const toolIcon = tool === 'paraclinicos' ? ClipboardList : tool === 'acciones' ? HeartPulse : Activity;
  const ToolIcon = toolIcon;
  return <main className="simulator">
    <nav className="phase-bar" aria-label="Fases de la estación">{PHASES.map((name, index) =>
      <button key={name} className={index === phase ? 'phase current' : 'phase'} aria-current={index === phase ? 'step' : undefined}
        onClick={() => { setPhase(index); if (index === 1) setTool('exploracion'); if (index === 3) setTool('acciones'); }}>
        <i>{index + 1}</i><span>{name}</span></button>)}</nav>
    <div className="station-heading"><span className="station-icon"><Stethoscope size={25}/></span><h1>Estación {String(session.index + 1).padStart(2, '0')} <span>· {station.title}</span></h1><b className="pill">{station.difficulty}</b></div>
    <div className="sim-grid">
      <section className="scene-panel">
        <div className="scene"><img src={scene} alt="Escena de consulta pediátrica" />
          <div className="timer"><Clock3 size={20}/><strong aria-label={'Tiempo restante ' + clock}>{clock}</strong><progress max={STATION_MS} value={time}/></div>
          <div className="subtitle"><span><Volume2 size={20}/></span><div>{latest?.reply ?? station.opening}
            {latest && <small>{latest.mode === 'ai' ? 'IA generativa' : 'Respuesta estructurada'}</small>}</div></div>
        </div>
        <div className="dialogue">
          <div className="voice-row">
            <button className="icon-button" disabled={!canSpeak} title={audio ? 'Silenciar' : 'Activar voz'} aria-label={audio ? 'Silenciar voz' : 'Activar voz'} aria-pressed={audio}
              onClick={() => { setAudio(!audio); if (audio) window.speechSynthesis.cancel(); else speak(latest?.reply ?? station.opening); }}>{audio ? <Volume2/> : <VolumeX/>}</button>
            <button className="mic" disabled={!voice.available || !time} title="Micrófono" aria-label={voice.listening ? 'Desactivar micrófono' : 'Activar micrófono'} aria-pressed={voice.listening} onClick={voice.toggle}>{voice.listening ? <MicOff/> : <Mic/>}</button>
            <button className="button secondary transcript" aria-expanded={tab} onClick={() => setTab(!tab)}><FileText size={17}/> Conversación</button>
          </div>
          {voice.voiceError && <p className="error" role="alert">{voice.voiceError}</p>}
          {voice.listening && <p role="status">Escuchando…</p>}
          {!voice.available && <small>Micrófono no disponible en este navegador.</small>}
          <form className="ask" onSubmit={ask}><input aria-label="Pregunta al familiar" placeholder="Escribe una pregunta al familiar ficticio…" maxLength={400} value={text} onChange={(event) => setText(event.target.value)}/>
            <button className="button primary" aria-label="Enviar pregunta" disabled={!time || sending || !text.trim()}><Send size={18}/></button></form>
          {tab && <div className="transcript-list">{!turns.length ? <span>Aún no has hecho preguntas.</span> : turns.map((turn, index) => <div key={index}><b>{turn.question}</b><p>{turn.reply}</p><small>{turn.mode === 'ai' ? 'IA generativa' : 'Respuesta estructurada'}</small></div>)}</div>}
        </div>
      </section>
      <aside className="tools card"><h2><BriefIcon/> Herramientas clínicas</h2><div className="tabs">
        {(['exploracion', 'paraclinicos', 'acciones'] as const).map((key) =>
          <button key={key} className={key === tool ? 'active' : ''} aria-pressed={key === tool} onClick={() => { setTool(key); setFinding(''); }}>
            {key === 'acciones' ? 'Acciones' : labels[key]}</button>)}</div>
        <div className="tool-buttons">{toolOptions.map((item) => <button key={item.id} aria-pressed={selected.includes(item.id)} disabled={saving || !time} onClick={() => choose(item)}><ToolIcon size={24}/>{item.label}</button>)}
          {!toolOptions.length && <p>No hay opciones de esta categoría para el caso.</p>}</div>
        <div className="findings"><h3><ClipboardList size={19}/> Hallazgos solicitados</h3><p aria-live="polite">{finding || 'Selecciona una herramienta para ver los hallazgos.'}</p></div>
      </aside>
    </div>
    <section className="card station-options"><h2><Brain size={21}/> {labels[centralGroup]}</h2><p>{phase === 0 ? station.scenario : 'Selecciona y registra tus decisiones durante la estación.'}</p>
      {phase === 1 ? <p>Solicita los hallazgos en Herramientas clínicas.</p> :
        <div className="option-list">{station.interactions.filter((item) => item.group === centralGroup).map((item) =>
          <button key={item.id} className={'button secondary ' + (selected.includes(item.id) ? 'picked' : '')} aria-pressed={selected.includes(item.id)} disabled={saving || !time} onClick={() => choose(item)}>{item.label}</button>)}</div>}
    </section>
    {error && <p className="notice error" role="alert">{error}</p>}
    <footer className="station-footer"><span><ClipboardList size={20}/> {session.index + 1} de 3 · Evaluación sobre 100</span>
      <button className="button primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Guardando…' : 'Finalizar estación'}</button></footer>
  </main>;
}
function BriefIcon() { return <span className="clinical-icon"><HeartPulse size={18}/></span>; }

export function Circuit({ user }: { user: User }) {
  const [active, setActive] = useState<Session | null>(null);
  const [recent, setRecent] = useState<Existing[]>([]);
  const [result, setResult] = useState<Grade | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const id = location.pathname.split('/')[2];
  const requested = new URLSearchParams(location.search).get('caso');
  const fetchSession = useCallback(async (sessionId: string, current: () => boolean = () => true) => {
    const data = await call<Session>(user, '/circuits/' + sessionId);
    if (!current()) return;
    setActive(data);
    if (!data.deadline && data.index > 0) {
      const record = await getDocFromServer(doc(database, 'station_results', sessionId + '-' + (data.index - 1)));
      if (current() && record.exists()) setResult(record.data() as Grade);
    }
  }, [user]);
  useEffect(() => {
    let current = true;
    setActive(null);
    setResult(null);
    setBusy(true);
    setError('');
    const load = id ? fetchSession(id, () => current) : getDocsFromServer(query(collection(database, 'simulation_sessions'), where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'), limit(12))).then((snapshot) => {
        if (current) setRecent(snapshot.docs.map((item) => ({ id: item.id, index: item.data().index, complete: item.data().complete })));
      });
    void load.catch((failure) => { if (current) setError(messageOf(failure)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [fetchSession, id, user.uid]);
  async function act(action: 'new'|'next'|'refresh') {
    setBusy(true);
    setError('');
    try {
      if (action === 'new') {
        const started = await call<{ id: string }>(user, '/circuits', requested ? { caseId: requested } : {});
        navigate('/simulador/' + started.id);
      } else {
        if (action === 'next') await call(user, '/circuits/' + id + '/next', {});
        setResult(null);
        await fetchSession(id);
      }
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  if (id && active?.id === id && active.case && active.deadline) return <Station key={active.id + active.index} user={user} session={active} onSaved={() => {
    setBusy(true);
    setActive(null);
    void fetchSession(id).catch((failure) => setError(messageOf(failure))).finally(() => setBusy(false));
  }}/>;
  const pending = recent.find((item) => !item.complete);
  return <main className="page">
    <div className="page-heading"><Stethoscope/><div><h1>{active?.complete ? 'Circuito completado' : 'Simulador ECOE'}</h1><p>3 estaciones · 5 minutos por estación</p></div></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {busy && <p role="status">Cargando circuito…</p>}
    {!id && <section className="card intro-card"><h2>Prepárate para la consulta</h2><p>Explora el caso, registra tus decisiones y consulta la evaluación al finalizar cada estación.</p>
      {requested && <p>El caso que elegiste en el banco será la primera de tres estaciones.</p>}
      {pending && <Link className="button secondary" to={'/simulador/' + pending.id}>Retomar circuito</Link>}
      <button className="button primary" disabled={!apiReady || busy} onClick={() => void act('new')}>Iniciar circuito</button>
      {!apiReady && <p role="status">El Worker requiere configuración.</p>}</section>}
    {id && !busy && !active && <><button className="button secondary" onClick={() => void act('refresh')}>Volver a cargar el circuito</button> <Link to="/simulador">Regresar al simulador</Link></>}
    {active && !busy && <section className="card"><h2>{result ? result.title + ' · ' + result.score + '/100' : 'Progreso del circuito'}</h2>
      {result && <GradeDetail result={result}/>}
      {active.complete ? <Link className="button primary" to="/resultados">Ver historial</Link> :
        <button className="button primary" onClick={() => void act('next')}>Iniciar estación {active.index + 1}</button>}</section>}
  </main>;
}
