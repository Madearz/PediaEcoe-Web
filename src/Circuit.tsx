import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, Brain, CircleCheck, ClipboardList, Clock3, Droplets, Eye, FileText, HeartPulse, Mic, MicOff, Phone, PhoneOff, Send, Stethoscope, Volume2, VolumeX, Wind, type LucideIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, doc, getDocFromServer, getDocsFromServer, orderBy, query, where, limit } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { apiReady, call, messageOf, RequestError } from './firebase';
import { database, GradeDetail } from './Student';
import { ReviewChat } from './ReviewChat';
import { scene } from './App';
import { canListen, canSpeak, listenForQuestion, playSpeech, speak, useVoice } from './voice';
import { createVoiceCall, type CallPhase, type CallState } from './voice-call';
import { PHASES, SINGLE, STATION_MS, structured, type CaseData, type Grade, type Group, type Interaction } from '../shared/clinical.mjs';
import { PATIENT_HISTORY_LIMIT } from '../shared/dialogue.mjs';
import { EXAM_AREAS, examAreas, type ExamArea } from '../shared/exam.mjs';

type Session = { id: string; index: number; complete: boolean; case: CaseData | null; titles: string[]; deadline: number | null; serverNow: number };
type Turn = { question: string; reply: string; mode: 'structured'|'ai' };
type Existing = { id: string; index: number; complete: boolean };
const phases: Group[][] = [['anamnesis'], ['exploracion', 'paraclinicos'], ['razonamiento'], ['acciones'], ['cierre']];
const callLabels: Record<CallPhase, string> = {
  idle: '', listening: 'Te escucha. Habla ahora.', thinking: 'El familiar está preparando su respuesta…',
  speaking: 'El familiar está hablando…', paused: 'Micrófono en pausa.',
};
const labels: Record<Group, string> = { anamnesis: 'Preguntas de anamnesis', exploracion: 'Exploración física',
  paraclinicos: 'Paraclínicos', razonamiento: 'Decisión diagnóstica', acciones: 'Conducta inicial', cierre: 'Comunicación y cierre' };
const examIcons: Record<ExamArea, LucideIcon> = {
  vitals: Activity, respiratory: Wind, cardiovascular: HeartPulse, abdomen: Droplets, neurological: Brain,
  skin: Eye, other: Stethoscope,
};

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
  const [examArea, setExamArea] = useState<ExamArea | 'all'>('all');
  const [latestFinding, setLatestFinding] = useState('');
  const examOptions = useMemo(() => station.interactions.filter((item) => item.group === 'exploracion').map((item) => ({
    ...item, areas: examAreas(item.label),
  })), [station.interactions]);
  const [time, setTime] = useState(() => Math.max(0, deadline - session.serverNow));
  const [tab, setTab] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const transcript = useRef<Turn[]>([]);
  const textRequest = useRef<AbortController | null>(null);
  const [text, setText] = useState('');
  const [audio, setAudio] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const expired = useRef(false);
  const voice = useVoice(setText);
  const stopDictation = voice.stop;
  const latest = turns.at(-1);
  const [callState, setCallState] = useState<CallState>({ phase: 'idle', muted: false });
  const callActive = callState.phase !== 'idle';
  const voiceAnswer = useRef<(question: string, signal: AbortSignal) => Promise<string>>(requestAnswer);
  voiceAnswer.current = requestAnswer;
  const [voiceCall] = useState(() => createVoiceCall({
    listen: listenForQuestion,
    answer: (question, signal) => voiceAnswer.current(question, signal),
    say: playSpeech,
    change: setCallState,
  }));
  useEffect(() => () => {
    voiceCall.stop();
    textRequest.current?.abort();
    if (canSpeak) window.speechSynthesis.cancel();
  }, [voiceCall]);
  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    voiceCall.stop();
    stopDictation();
    textRequest.current?.abort();
    if (canSpeak) window.speechSynthesis.cancel();
    setSaving(true);
    setError('');
    try {
      const { resultId } = await call<{ resultId: string }>(user, '/circuits/' + session.id + '/submit', { index: session.index, selections: selected });
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
      onSaved(resultId);
    } catch (failure) { setError(messageOf(failure)); }
    finally { submitting.current = false; setSaving(false); }
  }, [onSaved, selected, session.id, session.index, stopDictation, storageKey, user, voiceCall]);
  useEffect(() => {
    const baseline = performance.now();
    const tick = () => setTime(Math.max(0, deadline - session.serverNow - (performance.now() - baseline)));
    const timer = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [deadline, session.serverNow]);
  useEffect(() => {
    if (time <= 0 && !expired.current) { expired.current = true; void submit(); }
  }, [time, submit]);
  function choose(item: Interaction) {
    if (time <= 0 || saving) return;
    const previous = SINGLE.includes(item.group) ? selected.filter((id) => station.interactions.find((option) => option.id === id)?.group !== item.group) : selected;
    const next = [...new Set([...previous, item.id])];
    setSelected(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Progress can still be submitted. */ }
    if (!item.reply) return;
    if (item.group === 'exploracion' || item.group === 'paraclinicos') {
      setLatestFinding(item.id);
      return;
    }
    if (item.group !== 'anamnesis') return;
    addTurn({ question: item.label, reply: item.reply, mode: 'structured' });
    if (audio && !callActive && !voice.listening) speak(item.reply);
  }
  function addTurn(turn: Turn) {
    transcript.current = [...transcript.current.slice(-29), turn];
    setTurns(transcript.current);
  }
  async function requestAnswer(question: string, signal: AbortSignal) {
    const history = transcript.current.slice(-PATIENT_HISTORY_LIMIT).map((turn) => ({
      question: turn.question, reply: turn.reply.slice(0, 400),
    }));
    let answer: Omit<Turn, 'question'>;
    try {
      answer = await call(user, '/circuits/' + session.id + '/dialogue', { question, history, index: session.index }, signal);
    } catch (failure) {
      signal.throwIfAborted();
      if (failure instanceof RequestError && [401, 403, 409].includes(failure.status)) throw failure;
      answer = { mode: 'structured', reply: structured(station, question, history) };
    }
    signal.throwIfAborted();
    addTurn({ question, ...answer });
    return answer.reply;
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (!question || textRequest.current || saving || !time || callActive || voice.listening) return;
    const request = new AbortController();
    textRequest.current = request;
    setSending(true);
    setError('');
    try {
      const reply = await requestAnswer(question, request.signal);
      setText((previous) => previous.trim() === question ? '' : previous);
      if (audio) speak(reply);
    } catch (failure) {
      if (!request.signal.aborted) setError(messageOf(failure));
    } finally {
      if (textRequest.current === request) { textRequest.current = null; setSending(false); }
    }
  }
  function toggleCall() {
    if (callActive) { voiceCall.stop(); return; }
    if (!canListen || !canSpeak || !time || saving || textRequest.current) return;
    stopDictation();
    window.speechSynthesis.cancel();
    setError('');
    voiceCall.start();
  }
  const totalSeconds = Math.ceil(time / 1000);
  const clock = [Math.floor(totalSeconds / 60), totalSeconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
  const centralGroup = phases[phase][0];
  const toolOptions = tool === 'exploracion'
    ? examOptions.filter((item) => examArea === 'all' || item.areas.includes(examArea))
    : station.interactions.filter((item) => item.group === tool).map((item) => ({ ...item, areas: [] }));
  const availableAreas = (Object.keys(EXAM_AREAS) as ExamArea[]).filter((area) => examOptions.some((item) => item.areas.includes(area)));
  const findings = selected.map((id) => station.interactions.find((item) => item.id === id))
    .filter((item): item is Interaction => Boolean(item && (item.group === 'exploracion' || item.group === 'paraclinicos') && item.reply))
    .reverse();
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
            <button type="button" className={`button call-button ${callActive ? 'call-end' : 'primary'}`}
              disabled={!canListen || !canSpeak || !time || sending || saving} onClick={toggleCall}>
              {callActive ? <><PhoneOff size={19}/> Colgar</> : <><Phone size={19}/> Iniciar llamada</>}
            </button>
            {callActive && <button type="button" className="button secondary" aria-pressed={callState.muted} onClick={voiceCall.toggleMute}>
              {callState.muted ? <><MicOff size={18}/> Reanudar micrófono</> : <><Mic size={18}/> Silenciar micrófono</>}
            </button>}
            <button type="button" className="icon-button" disabled={!canSpeak || callActive || voice.listening}
              title={audio ? 'Silenciar respuestas escritas' : 'Escuchar respuestas escritas'} aria-label={audio ? 'Silenciar respuestas escritas' : 'Escuchar respuestas escritas'} aria-pressed={audio}
              onClick={() => { setAudio(!audio); if (audio) window.speechSynthesis.cancel(); else speak(latest?.reply ?? station.opening); }}>{audio ? <Volume2/> : <VolumeX/>}</button>
            <button type="button" className="button secondary transcript" aria-expanded={tab} onClick={() => setTab(!tab)}><FileText size={17}/> Conversación</button>
          </div>
          {callActive && <p className="call-status" data-phase={callState.phase} role="status">
            <span aria-hidden="true"/>{callLabels[callState.phase]}
          </p>}
          {callState.error && <p className="error" role="alert">{callState.error}</p>}
          {voice.voiceError && !callActive && <p className="error" role="alert">{voice.voiceError}</p>}
          {voice.listening && <p role="status">Dictando…</p>}
          {!canListen || !canSpeak ? <small>La llamada requiere micrófono y reproducción de voz compatibles. Puedes escribir tu pregunta.</small>
            : callActive && <small>Las preguntas por voz quedan en la conversación. Usa Anamnesis para registrar los criterios evaluables.</small>}
          <form className="ask" onSubmit={ask}>
            {voice.available && <button type="button" className="icon-button" aria-label={voice.listening ? 'Detener dictado' : 'Dictar en el campo de texto'}
              title={voice.listening ? 'Detener dictado' : 'Dictar en el campo de texto'} aria-pressed={voice.listening}
              disabled={!time || callActive || sending || saving}
              onClick={() => { if (canSpeak && !voice.listening) window.speechSynthesis.cancel(); voice.toggle(); }}>
              {voice.listening ? <MicOff size={18}/> : <Mic size={18}/>}
            </button>}
            <input aria-label="Pregunta al paciente o al familiar" placeholder={callActive ? 'Cuelga para enviar una pregunta escrita' : 'Ejemplo: ¿Qué los trae a consulta hoy?'}
              maxLength={400} value={text} onChange={(event) => setText(event.target.value)}/>
            <button className="button primary" aria-label="Enviar pregunta" disabled={!time || callActive || voice.listening || sending || saving || !text.trim()}><Send size={18}/></button>
          </form>
          {tab && <div className="transcript-list">{!turns.length ? <span>Aún no has hecho preguntas.</span> : turns.map((turn, index) => <div key={index}><b>{turn.question}</b><p>{turn.reply}</p><small>{turn.mode === 'ai' ? 'IA generativa' : 'Respuesta estructurada'}</small></div>)}</div>}
        </div>
      </section>
      <aside className="tools card" id="station-clinical-tools" tabIndex={-1}><h2><BriefIcon/> Herramientas clínicas</h2><div className="tabs">
        {(['exploracion', 'paraclinicos', 'acciones'] as const).map((key) =>
          <button key={key} className={key === tool ? 'active' : ''} aria-pressed={key === tool} onClick={() => setTool(key)}>
            {key === 'acciones' ? 'Acciones' : labels[key]}</button>)}</div>
        {tool === 'exploracion' && availableAreas.length > 1 && <div className="exam-areas" role="group" aria-label="Sistemas del examen físico">
          <button type="button" aria-pressed={examArea === 'all'} onClick={() => setExamArea('all')}>Todos</button>
          {availableAreas.map((area) => <button type="button" key={area} aria-pressed={examArea === area}
            onClick={() => setExamArea(area)}>{EXAM_AREAS[area]}</button>)}
        </div>}
        <div className="tool-buttons">{toolOptions.map((item) => {
          const area = examArea === 'all' ? item.areas[0] : examArea;
          const ToolIcon = tool === 'paraclinicos' ? ClipboardList : tool === 'acciones' ? HeartPulse : examIcons[area ?? 'other'];
          const requested = selected.includes(item.id);
          return <button key={item.id} aria-pressed={requested} disabled={saving || !time} onClick={() => choose(item)}>
            <ToolIcon size={24} aria-hidden="true"/><span>{item.label}</span>
            {requested && <small><CircleCheck size={14} aria-hidden="true"/>{tool === 'acciones' ? 'Seleccionada' : 'Solicitado'}</small>}
          </button>;
        })}
          {!toolOptions.length && <p>Este caso no incluye {tool === 'exploracion' ? 'hallazgos de examen físico' : tool === 'paraclinicos' ? 'paraclínicos' : 'acciones'} en esta sección.</p>}</div>
        <div className="findings"><h3><ClipboardList size={19}/> Hallazgos solicitados</h3>
          <span className="sr-only" role="status">{latestFinding && findings.find((item) => item.id === latestFinding)?.reply}</span>
          {findings.length ? <ul className="findings-list">{findings.map((item) => <li key={item.id} className={item.id === latestFinding ? 'latest' : ''}>
            <small>{labels[item.group]}</small><strong>{item.label}</strong><p>{item.reply}</p>
          </li>)}</ul> : <p>Solicita una exploración o un paraclínico para ver su resultado aquí.</p>}
        </div>
      </aside>
    </div>
    <section className="card station-options"><h2><Brain size={21}/> {labels[centralGroup]}</h2><p>{phase === 0 ? station.scenario : 'Selecciona y registra tus decisiones durante la estación.'}</p>
      {phase === 1 ? <button type="button" className="button secondary" onClick={() => {
        setTool('exploracion');
        document.getElementById('station-clinical-tools')?.focus();
      }}>Ir a exploración física</button> :
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
  const [result, setResult] = useState<{ id: string; grade: Grade } | null>(null);
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
      if (current() && record.exists()) setResult({ id: record.id, grade: record.data() as Grade });
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
    {active && !busy && <section className="card"><h2>{result ? result.grade.title + ' · ' + result.grade.score + '/100' : 'Progreso del circuito'}</h2>
      {result && <><ReviewChat key={result.id} resultId={result.id} user={user} result={result.grade}/><GradeDetail result={result.grade}/></>}
      {active.complete ? <Link className="button primary" to="/resultados">Ver historial</Link> :
        <button className="button primary" onClick={() => void act('next')}>Iniciar estación {active.index + 1}</button>}</section>}
  </main>;
}
