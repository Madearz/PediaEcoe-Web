import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, Bone, Brain, CircleCheck, ClipboardList, Clock3, Droplets, Ear, Eye, FileText, HeartPulse, Mic, MicOff, Pause, Phone, PhoneOff, Play, Send, Stethoscope, Volume2, VolumeX, Wind, type LucideIcon } from 'lucide-react';
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
import { isVaccinationCardRequest, patientHistoryReply, PATIENT_HISTORY_LIMIT, vaccinationCard } from '../shared/dialogue.mjs';
import { completeExam, EXAM_AREAS, examAreas, examRequest, systemExam, type ExamArea, type ExamReport } from '../shared/exam.mjs';
import { availableStudyOptions, displayStoredStudy, isStudyListRequest, MISSING_STUDY_VALUE, requestedStudies, studySuggestions, type StudyFinding } from '../shared/studies.mjs';
import { FOLLOW_UP, JUSTIFICATION_LIMIT, registerAnamnesis, type FollowUp } from '../shared/learning.mjs';
import { type ReasoningNote, type TreatmentPlan } from '../shared/decisions.mjs';
import { ReasoningFields, TreatmentFields } from './Decisions';

type Evolution = { action: string; findings: string[] };
type StationClock = { deadline: number; serverNow: number; pausedRemaining?: number | null };
type Session = { id: string; index: number; complete: boolean; case: CaseData | null; caseIds?: string[]; titles: string[]; deadline: number | null; serverNow: number;
  pausedRemaining?: number | null; hasEvolution?: boolean; evolution?: Evolution };
type Turn = { question: string; reply: string; mode: 'structured'|'ai'; clinical?: boolean };
type DecisionDraft = { reasoning: ReasoningNote[]; treatment: TreatmentPlan; nextTest: string };
type SupplementalFinding = StudyFinding & { group: 'exploracion'|'paraclinicos' };
const turnLabel = (turn: Turn) => turn.clinical ? 'Resultado de la estación' : turn.mode === 'ai' ? 'IA generativa' : 'Respuesta estructurada';
type Existing = { id: string; index: number; complete: boolean };
const phases: Group[][] = [['anamnesis'], ['exploracion', 'paraclinicos'], ['razonamiento'], ['acciones'], ['cierre']];
const callLabels: Record<CallPhase, string> = {
  idle: '', listening: 'Te escucha. Habla ahora.', thinking: 'El familiar está preparando su respuesta…',
  speaking: 'El familiar está hablando…', paused: 'Micrófono en pausa.',
};
const labels: Record<Group, string> = { anamnesis: 'Preguntas de anamnesis', exploracion: 'Exploración física',
  paraclinicos: 'Paraclínicos', razonamiento: 'Decisión diagnóstica', acciones: 'Conducta inicial', cierre: 'Comunicación y cierre' };
const examIcons: Record<ExamArea, LucideIcon> = {
  general: Stethoscope, growth: Activity, head: Eye, urinary: Droplets,
  vitals: Activity, respiratory: Wind, cardiovascular: HeartPulse, abdomen: Droplets, neurological: Brain,
  skin: Eye, ent: Ear, musculoskeletal: Bone, other: Stethoscope,
};

function Station({ user, session, onSaved }: { user: User; session: Session; onSaved: (resultId: string) => void }) {
  const station = session.case!;
  const caseId = session.caseIds?.[session.index];
  const storageKey = `pediaecoe:${user.uid}:${session.id}:${session.index}`;
  function readDraft(key: string) {
    try { return sessionStorage.getItem(storageKey + ':' + key) ?? ''; } catch { return ''; }
  }
  function saveDraft(key: string, value: string) {
    try { sessionStorage.setItem(storageKey + ':' + key, value); } catch { /* The current station still works without storage. */ }
  }
  const [selected, setSelected] = useState<string[]>(() => {
    let saved: unknown;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]'); } catch { /* Stored data may be unavailable. */ }
    const locked = session.evolution?.action;
    const retained = Array.isArray(saved) ? saved.filter((id) => station.interactions.some((item) => item.id === id
      && (!locked || item.group !== 'acciones'))) : [];
    return locked ? [...retained, locked] : retained;
  });
  const selectedRef = useRef(selected);
  const [clockInfo, setClockInfo] = useState<StationClock>({
    deadline: session.deadline!, serverNow: session.serverNow, pausedRemaining: session.pausedRemaining,
  });
  const [clockBusy, setClockBusy] = useState(false);
  const paused = Boolean(clockInfo.pausedRemaining);
  const clockPending = useRef(false);
  const [evolution, setEvolution] = useState(session.evolution);
  const [evolving, setEvolving] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUp | ''>(() => {
    const saved = readDraft('followup');
    return Object.hasOwn(FOLLOW_UP, saved) ? saved as FollowUp : '';
  });
  const [justification, setJustification] = useState(() => readDraft('justification').slice(0, JUSTIFICATION_LIMIT));
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(() => {
    try { const saved = JSON.parse(readDraft('decisions')); if (saved?.treatment && Array.isArray(saved.reasoning)) return saved; }
    catch { /* A new draft is available if storage is unavailable. */ }
    return { reasoning: [], treatment: {}, nextTest: '' };
  });
  function updateDecisions(next: DecisionDraft) {
    setDecisionDraft(next);
    saveDraft('decisions', JSON.stringify(next));
  }
  const [finishing, setFinishing] = useState(false);
  const [differentials, setDifferentials] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(readDraft('differentials'));
      return Array.isArray(saved) ? saved.filter((id) => station.interactions.some((item) => item.group === 'razonamiento' && item.id === id)).slice(0, 2) : [];
    } catch { return []; }
  });
  const [anamnesisEvidence] = useState<string[]>(() => {
    try { const saved: unknown = JSON.parse(readDraft('anamnesis')); return Array.isArray(saved) ? saved.filter((value) => typeof value === 'string') : []; }
    catch { return []; }
  });
  const evidence = useRef(anamnesisEvidence);
  const [registered, setRegistered] = useState<string[]>([]);
  const [phase, setPhase] = useState(0);
  const [tool, setTool] = useState<Group>('exploracion');
  const [examArea, setExamArea] = useState<ExamArea | 'all'>('all');
  const [fullExamOpen, setFullExamOpen] = useState(false);
  const [latestFinding, setLatestFinding] = useState('');
  const [supplemental, setSupplemental] = useState<SupplementalFinding[]>(() => {
    try {
      const saved: SupplementalFinding[] = JSON.parse(readDraft('studies'));
      return Array.isArray(saved) ? saved.filter((item) => item?.group === 'paraclinicos' && item.kind === 'simulated'
        && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.reply === 'string') : [];
    } catch { return []; }
  });
  const examOptions = useMemo(() => station.interactions.filter((item) => item.group === 'exploracion').map((item) => ({
    ...item, areas: examAreas(item.label + ' ' + item.reply),
  })), [station.interactions]);
  const suggestedStudies = useMemo(() => studySuggestions(station, caseId), [station, caseId]);
  const studyOptions = useMemo(() => availableStudyOptions(station, caseId), [station, caseId]);
  const [studyListOpen, setStudyListOpen] = useState(false);
  const [customStudy, setCustomStudy] = useState('');
  const [time, setTime] = useState(() => clockInfo.pausedRemaining ?? Math.max(0, clockInfo.deadline - clockInfo.serverNow));
  const [tab, setTab] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const card = useMemo(() => vaccinationCard(station), [station]);
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
  const canInteract = !paused && !clockBusy && time > 0;
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
    if (submitting.current || paused || clockPending.current) return;
    submitting.current = true;
    voiceCall.stop();
    stopDictation();
    textRequest.current?.abort();
    if (canSpeak) window.speechSynthesis.cancel();
    setSaving(true);
    setError('');
    try {
      const principal = selectedRef.current.find((id) => station.interactions.some((item) => item.group === 'razonamiento' && item.id === id));
      const { resultId } = await call<{ resultId: string }>(user, '/circuits/' + session.id + '/submit', {
        index: session.index, selections: selectedRef.current, justification,
        differentials: differentials.filter((id) => id !== principal),
        reasoning: decisionDraft.reasoning.filter((row) => row.diagnosis === principal || differentials.includes(row.diagnosis)),
        treatment: decisionDraft.treatment, nextTest: decisionDraft.nextTest,
        ...(evolution && followUp ? { followUp } : {}),
      });
      try {
        sessionStorage.removeItem(storageKey);
        for (const key of ['justification', 'followup', 'differentials', 'anamnesis', 'studies', 'decisions']) sessionStorage.removeItem(storageKey + ':' + key);
      } catch { /* Storage may be disabled. */ }
      onSaved(resultId);
    } catch (failure) { setError(messageOf(failure)); }
    finally { submitting.current = false; setSaving(false); }
  }, [onSaved, session.id, session.index, stopDictation, storageKey, user, voiceCall, paused, justification, differentials, decisionDraft, evolution, followUp, station.interactions]);
  useEffect(() => {
    if (clockInfo.pausedRemaining) { setTime(clockInfo.pausedRemaining); return; }
    const baseline = performance.now();
    const tick = () => setTime(Math.max(0, clockInfo.deadline - clockInfo.serverNow - (performance.now() - baseline)));
    tick();
    const timer = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [clockInfo]);
  useEffect(() => {
    if (time <= 0 && !paused && !clockBusy && !expired.current) { expired.current = true; void submit(); }
  }, [time, submit, paused, clockBusy]);
  async function toggleClock() {
    if (clockPending.current || submitting.current || evolving || (!paused && !time)) return;
    clockPending.current = true;
    setClockBusy(true);
    setError('');
    voiceCall.stop();
    stopDictation();
    textRequest.current?.abort();
    if (canSpeak) window.speechSynthesis.cancel();
    try {
      const clock = await call<StationClock>(user, `/circuits/${session.id}/${paused ? 'resume' : 'pause'}`, { index: session.index });
      setTime(clock.pausedRemaining ?? Math.max(0, clock.deadline - clock.serverNow));
      setClockInfo(clock);
    } catch (failure) { setError(messageOf(failure)); }
    finally { clockPending.current = false; setClockBusy(false); }
  }
  function recordSelections(ids: string[], replaceGroup?: Group) {
    const previous = replaceGroup ? selectedRef.current.filter((id) => station.interactions.find((option) => option.id === id)?.group !== replaceGroup) : selectedRef.current;
    const next = [...new Set([...previous, ...ids])];
    selectedRef.current = next;
    setSelected(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Progress can still be submitted. */ }
  }
  function choose(item: Interaction) {
    if (!canInteract || submitting.current || (item.group === 'acciones' && (evolution || evolving))) return;
    recordSelections([item.id], SINGLE.includes(item.group) ? item.group : undefined);
    if (item.group === 'razonamiento' && differentials.includes(item.id)) {
      const next = differentials.filter((id) => id !== item.id);
      setDifferentials(next);
      saveDraft('differentials', JSON.stringify(next));
    }
    if (!item.reply) return;
    if (item.group === 'exploracion' || item.group === 'paraclinicos') {
      setLatestFinding(item.id);
      return;
    }
    if (item.group !== 'anamnesis') return;
    addTurn({ question: item.label, reply: item.reply, mode: 'structured' });
    if (audio && !callActive && !voice.listening) speak(item.reply);
  }
  function revealExam(result: ExamReport, area: ExamArea | 'all', full = false) {
    if (!canInteract || submitting.current) return;
    setExamArea(area);
    setFullExamOpen(full);
    if (result.recorded.length) recordSelections(result.recorded.map(({ id }) => id));
    const entries = result.supplemental.map((item) => ({ ...item, group: 'exploracion' as const }));
    if (entries.length) setSupplemental((previous) => [...entries, ...previous.filter((item) => !entries.some(({ id }) => item.id === id))]);
    setLatestFinding(entries[0]?.id ?? result.recorded[0]?.id ?? '');
  }
  async function revealEvolution(action: string) {
    if (!canInteract || saving || evolving || evolution) return;
    setEvolving(true);
    setError('');
    try {
      const next = await call<Evolution>(user, '/circuits/' + session.id + '/evolution', { index: session.index, action });
      setEvolution(next);
      recordSelections([next.action], 'acciones');
    } catch (failure) { setError(messageOf(failure)); }
    finally { setEvolving(false); }
  }
  function addTurn(turn: Turn) {
    transcript.current = [...transcript.current.slice(-29), turn];
    setTurns(transcript.current);
  }
  function registerQuestion(question: string) {
    const matched = registerAnamnesis(station.interactions, question, evidence.current);
    evidence.current = matched.evidence;
    saveDraft('anamnesis', JSON.stringify(matched.evidence));
    const newlyRegistered = matched.registered.filter((id) => !selectedRef.current.includes(id));
    if (newlyRegistered.length) {
      recordSelections(newlyRegistered);
      setRegistered(newlyRegistered);
    }
  }
  async function requestAnswer(question: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!canInteract || submitting.current) throw new Error('La estación no está activa.');
    if (isStudyListRequest(question)) {
      setTool('paraclinicos');
      setStudyListOpen(true);
      const names = studyOptions.slice(0, 4).map(({ label }) => label).join(', ');
      const reply = names ? `Puedes consultar ${names}. El panel muestra todos los estudios disponibles.`
        : 'Esta estación no tiene informes disponibles. Puedes consultar un estudio específico.';
      addTurn({ question, reply, mode: 'structured', clinical: true });
      return reply;
    }
    if (isVaccinationCardRequest(question)) {
      const reply = patientHistoryReply(station, question);
      if (reply) {
        setCardOpen(true);
        registerQuestion(question);
        addTurn({ question, reply, mode: 'structured' });
        return reply;
      }
    }
    const studies = requestedStudies(station, question, caseId);
    const exam = examRequest(station, question);
    if (exam?.complete && !studies) {
      setTool('exploracion');
      revealExam(exam, 'all', true);
      const reply = 'El examen físico completo está disponible por sistemas en el panel de Exploración física.';
      addTurn({ question, reply, mode: 'structured', clinical: true });
      return reply;
    }
    if (studies || exam) {
      if (time <= 0 || submitting.current) throw new Error('La estación ya terminó.');
      const documented = [...(exam?.recorded ?? []), ...(studies?.documented ?? [])];
      const extra: SupplementalFinding[] = [...(exam?.supplemental ?? []).map((item) => ({ ...item, group: 'exploracion' as const })), ...(studies?.supplemental ?? []).map((item) => ({
        ...item, id: 'study:' + item.id, group: 'paraclinicos' as const,
      }))];
      const missing = extra.filter(({ id, canSimulate }) => canSimulate
        && !supplemental.some((item) => item.id === id && item.kind === 'simulated')).slice(0, 6);
      let generated: { id: string; reply: string }[] = [];
      if (missing.length && apiReady) {
        try {
          ({ results: generated } = await call<{ results: { id: string; reply: string }[] }>(user,
            `/circuits/${session.id}/studies`, { question, index: session.index, ids: missing.map(({ id }) => id.slice(6)) }, signal));
        } catch (failure) {
          signal.throwIfAborted();
          if (failure instanceof RequestError && [401, 403, 409].includes(failure.status)) throw failure;
        }
      }
      signal.throwIfAborted();
      for (const item of extra.filter(({ canSimulate }) => canSimulate)) {
        const cached = supplemental.find(({ id, kind }) => id === item.id && kind === 'simulated');
        const report = generated.find(({ id }) => 'study:' + id === item.id);
        if (cached || report) { item.reply = (cached ?? report)!.reply; item.kind = 'simulated'; }
        else item.reply = 'No se pudo generar el informe ahora. Puedes solicitarlo de nuevo.';
      }
      if (exam && !documented.length && !extra.length && !studies) {
        extra.push({ id: 'exam:unavailable', group: 'exploracion', label: 'Exploración solicitada',
          reply: 'Puedes consultar un sistema concreto o pedir el examen físico completo.', kind: 'unavailable' });
      }
      if (documented.length) recordSelections(documented.map((item) => item.id));
      if (extra.length) {
        const merged = [...extra, ...supplemental.filter((item) => !extra.some(({ id }) => id === item.id))];
        setSupplemental(merged);
        saveDraft('studies', JSON.stringify(merged.filter(({ group, kind }) => group === 'paraclinicos' && kind === 'simulated').slice(0, 50)));
      }
      setLatestFinding(extra.at(-1)?.id ?? documented.at(-1)?.id ?? '');
      setTool(studies ? 'paraclinicos' : 'exploracion');
      setExamArea('all');
      if (exam) setFullExamOpen(exam.complete);
      const reply = [
        ...documented.map((item) => `${item.label}. ${item.reply}`),
        ...extra.map((item) => `${item.label}. ${item.kind === 'simulated' ? 'Resultado simulado. ' : ''}${item.reply}`),
      ].join('\n');
      addTurn({ question, reply, mode: 'structured', clinical: true });
      return reply;
    }
    const history = transcript.current.filter((turn) => !turn.clinical).slice(-PATIENT_HISTORY_LIMIT).map((turn) => ({
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
    registerQuestion(question);
    addTurn({ question, ...answer });
    return answer.reply;
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (!question || textRequest.current || saving || !canInteract || callActive || voice.listening) return;
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
    if (!canListen || !canSpeak || !canInteract || saving || textRequest.current) return;
    stopDictation();
    window.speechSynthesis.cancel();
    setError('');
    voiceCall.start();
  }
  async function requestStudy(label: string, custom = false) {
    if (textRequest.current || saving || callActive || !canInteract) return;
    let question = `Solicito ${label}`;
    if (custom && !requestedStudies(station, question, caseId)) question = `Solicito prueba de ${label}`;
    const request = new AbortController();
    textRequest.current = request;
    setSending(true);
    setError('');
    try {
      const reply = await requestAnswer(question, request.signal);
      if (custom) setCustomStudy('');
      if (audio) speak(reply);
    } catch (failure) {
      if (!request.signal.aborted) setError(messageOf(failure));
    } finally {
      if (textRequest.current === request) { textRequest.current = null; setSending(false); }
    }
  }
  const totalSeconds = Math.ceil(time / 1000);
  const clock = [Math.floor(totalSeconds / 60), totalSeconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
  const centralGroup = phases[phase][0];
  const diagnosis = station.interactions.filter((item) => item.group === 'razonamiento');
  const hypotheses = [...diagnosis.filter(({ id }) => selected.includes(id)), ...diagnosis.filter(({ id }) => differentials.includes(id) && !selected.includes(id))];
  const observed = station.interactions.filter(({ id, group }) => selected.includes(id) && ['anamnesis', 'exploracion', 'paraclinicos'].includes(group));
  const action = selected.find((id) => station.interactions.some((item) => item.id === id && item.group === 'acciones'));
  const toolOptions = tool === 'exploracion'
    ? examOptions.filter((item) => examArea === 'all' || item.areas.includes(examArea))
    : station.interactions.filter((item) => item.group === tool).map((item) => ({ ...displayStoredStudy(station, item), areas: [] }));
  const availableAreas = Object.keys(EXAM_AREAS) as ExamArea[];
  const recordedFindings = selected.map((id) => station.interactions.find((item) => item.id === id))
    .filter((item): item is Interaction => Boolean(item && (item.group === 'exploracion' || item.group === 'paraclinicos')))
    .reverse().map((item) => displayStoredStudy(station, item)).filter((item) => item.reply)
    .map((item) => ({ ...item, kind: item.reply === MISSING_STUDY_VALUE ? 'unavailable' as const : 'case' as const }));
  const findings = [...supplemental, ...recordedFindings].sort((first, second) =>
    Number(second.id === latestFinding) - Number(first.id === latestFinding));
  return <main className="simulator">
    <nav className="phase-bar" aria-label="Fases de la estación">{PHASES.map((name, index) =>
      <button key={name} className={index === phase ? 'phase current' : 'phase'} aria-current={index === phase ? 'step' : undefined}
        onClick={() => { setPhase(index); if (index === 1) setTool('exploracion'); if (index === 3) setTool('acciones'); }}>
        <i>{index + 1}</i><span>{name}</span></button>)}</nav>
    <div className="station-heading"><span className="station-icon"><Stethoscope size={25}/></span><h1>Estación {String(session.index + 1).padStart(2, '0')} <span>· {station.title}</span></h1><b className="pill">{station.difficulty}</b>
      <button type="button" className="button secondary pause-station" disabled={saving || clockBusy || evolving || (!paused && !time)} onClick={() => void toggleClock()}>
        {paused ? <><Play size={16}/> Reanudar</> : <><Pause size={16}/> Pausar estación</>}
      </button>
    </div>
    {paused && <p className="notice" role="status">Estación en pausa. Tiempo restante {clock}.</p>}
    <div className="sim-grid">
      <section className="scene-panel">
        <div className="scene"><img src={scene} alt="Escena de consulta pediátrica" />
          <div className="timer"><Clock3 size={20}/><strong aria-label={'Tiempo restante ' + clock}>{clock}</strong><progress max={STATION_MS} value={time}/></div>
          <div className="subtitle"><span><Volume2 size={20}/></span><div>{latest?.reply ?? station.opening}
            {latest && <small>{turnLabel(latest)}</small>}</div></div>
        </div>
        <div className="dialogue">
          <div className="voice-row">
            <button type="button" className={`button call-button ${callActive ? 'call-end' : 'primary'}`}
              disabled={!canListen || !canSpeak || !canInteract || sending || saving} onClick={toggleCall}>
              {callActive ? <><PhoneOff size={19}/> Colgar</> : <><Phone size={19}/> Iniciar llamada</>}
            </button>
            {callActive && <button type="button" className="button secondary" aria-pressed={callState.muted} onClick={voiceCall.toggleMute}>
              {callState.muted ? <><MicOff size={18}/> Reanudar micrófono</> : <><Mic size={18}/> Silenciar micrófono</>}
            </button>}
            <button type="button" className="icon-button" disabled={!canSpeak || !canInteract || callActive || voice.listening}
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
            : callActive && <small>Puedes pedir el examen físico o un paraclínico durante la llamada. Los hallazgos aparecen en Herramientas clínicas.</small>}
          <form className="ask" onSubmit={ask}>
            {voice.available && <button type="button" className="icon-button" aria-label={voice.listening ? 'Detener dictado' : 'Dictar en el campo de texto'}
              title={voice.listening ? 'Detener dictado' : 'Dictar en el campo de texto'} aria-pressed={voice.listening}
              disabled={!canInteract || callActive || sending || saving}
              onClick={() => { if (canSpeak && !voice.listening) window.speechSynthesis.cancel(); voice.toggle(); }}>
              {voice.listening ? <MicOff size={18}/> : <Mic size={18}/>}
            </button>}
            <input aria-label="Pregunta al paciente o al familiar" placeholder={callActive ? 'Cuelga para enviar una pregunta escrita' : 'Ejemplo: ¿Qué los trae a consulta hoy?'}
              maxLength={400} value={text} disabled={!canInteract} onChange={(event) => setText(event.target.value)}/>
            <button className="button primary" aria-label="Enviar pregunta" disabled={!canInteract || callActive || voice.listening || sending || saving || !text.trim()}><Send size={18}/></button>
          </form>
          <button type="button" className="button secondary vaccination-toggle" aria-expanded={cardOpen}
            aria-controls="station-vaccination-card" disabled={!canInteract || saving || sending || (!cardOpen && callActive)} onClick={() => {
              if (cardOpen) { setCardOpen(false); return; }
              void requestAnswer('¿Puedo ver el carné de vacunación?', new AbortController().signal).then((reply) => {
                if (audio && !voice.listening) speak(reply);
              }).catch((failure) => setError(messageOf(failure)));
            }}><ClipboardList size={17}/>{cardOpen ? 'Cerrar carné' : 'Solicitar carné de vacunación'}</button>
          {cardOpen && <section id="station-vaccination-card" className="vaccination-card" aria-label="Carné de vacunación simulado">
            <h3><ClipboardList size={19}/> Carné de vacunación</h3>
            <small>Documento simulado de la estación</small>
            {!card ? <p role="status">No hay carné disponible en esta consulta.</p> : <>
              {card.summary && <p>{card.summary}</p>}
              {card.doses.length ? <div className="vaccination-table"><table>
                <thead><tr><th scope="col">Vacuna</th><th scope="col">Dosis</th><th scope="col">Fecha</th></tr></thead>
                <tbody>{card.doses.map((row, index) => <tr key={index}><th scope="row">{row.vaccine}</th>
                  <td>{row.dose || '—'}</td><td>{row.date ? row.date.split('-').reverse().join('/') : '—'}</td></tr>)}</tbody>
              </table></div> : <p>El caso tiene un resumen general del esquema.</p>}
            </>}
          </section>}
          {registered.length > 0 && <p className="notice" role="status">
            Anamnesis registrada · {station.interactions.filter(({ id }) => registered.includes(id)).map(({ label }) => label).join(' · ')}
          </p>}
          {tab && <div className="transcript-list">{!turns.length ? <span>Aún no has hecho preguntas.</span> : turns.map((turn, index) => <div key={index}><b>{turn.question}</b><p>{turn.reply}</p><small>{turnLabel(turn)}</small></div>)}</div>}
        </div>
      </section>
      <aside className="tools card" id="station-clinical-tools" tabIndex={-1}><h2><BriefIcon/> Herramientas clínicas</h2><div className="tabs">
        {(['exploracion', 'paraclinicos', 'acciones'] as const).map((key) =>
          <button key={key} className={key === tool ? 'active' : ''} aria-pressed={key === tool} onClick={() => setTool(key)}>
            {key === 'acciones' ? 'Acciones' : labels[key]}</button>)}</div>
        {tool === 'exploracion' && <div className="exam-areas" role="group" aria-label="Sistemas del examen físico">
          <button type="button" aria-pressed={fullExamOpen} disabled={!canInteract || saving}
            onClick={() => fullExamOpen ? setFullExamOpen(false) : revealExam(completeExam(station), 'all', true)}>Examen completo</button>
          {availableAreas.map((area) => <button type="button" key={area} aria-pressed={!fullExamOpen && examArea === area} disabled={!canInteract || saving}
            onClick={() => revealExam(completeExam(station, [area]), area)}>{EXAM_AREAS[area]}</button>)}
        </div>}
        {!(tool === 'exploracion' && fullExamOpen) && <div className="tool-buttons">{toolOptions.map((item) => {
          const area = examArea === 'all' ? item.areas[0] : examArea;
          const ToolIcon = tool === 'paraclinicos' ? ClipboardList : tool === 'acciones' ? HeartPulse : examIcons[area ?? 'other'];
          const requested = selected.includes(item.id);
          return <button key={item.id} aria-pressed={requested} disabled={saving || !canInteract || (tool === 'acciones' && Boolean(evolution || evolving))} onClick={() => choose(item)}>
            <ToolIcon size={24} aria-hidden="true"/><span>{item.label}</span>
            {requested && <small><CircleCheck size={14} aria-hidden="true"/>{tool === 'acciones' ? 'Seleccionada' : 'Solicitado'}</small>}
          </button>;
        })}
          {!toolOptions.length && (tool === 'acciones' || (tool === 'exploracion' && examArea === 'all')) &&
            <p>Selecciona un sistema para consultar sus hallazgos.</p>}</div>}
        {tool === 'paraclinicos' && <div className="study-suggestions">
          {suggestedStudies.length > 0 && <>
            <p>Ejemplos de paraclínicos</p>
            <div className="option-list">{suggestedStudies.map((study) => <button type="button" key={study.id}
              className="button secondary" aria-label={`Solicitar ${study.label}`} disabled={saving || sending || callActive || !canInteract}
              onClick={() => void requestStudy(study.label)}>{study.label}
              {study.documented && <small className="study-case">Del caso</small>}
            </button>)}</div>
          </>}
          <button type="button" className="button secondary" aria-expanded={studyListOpen} aria-controls="station-study-list"
            onClick={() => setStudyListOpen(!studyListOpen)}>{studyListOpen ? 'Ocultar estudios disponibles' : 'Ver estudios disponibles'}</button>
          {studyListOpen && <div id="station-study-list" className="option-list">
            {studyOptions.map((study) => <button key={study.id} type="button" className="button secondary" disabled={saving || sending || callActive || !canInteract}
              onClick={() => void requestStudy(study.label)}>{study.label}<small className="study-case">{study.kind === 'case' ? 'Del caso' : study.kind === 'simulated' ? 'Simulado' : 'Por solicitar'}</small></button>)}
            {!studyOptions.length && <small>No hay informes disponibles en esta estación.</small>}
          </div>}
          <form className="ask" onSubmit={(event) => { event.preventDefault(); if (customStudy.trim()) void requestStudy(customStudy.trim(), true); }}>
            <input aria-label="Otro paraclínico" maxLength={120} placeholder="Otro estudio, p. ej. ecografía de cadera"
              value={customStudy} disabled={!canInteract} onChange={(event) => setCustomStudy(event.target.value)}/>
            <button type="submit" className="button secondary" disabled={saving || sending || callActive || !canInteract || !customStudy.trim()}>Solicitar</button>
          </form>
          <small>También puedes pedir estudios por su nombre en la conversación.</small>
        </div>}
        {tool === 'exploracion' && fullExamOpen ? <div className="findings"><h3><ClipboardList size={19}/> Examen físico completo</h3>
          <ul className="findings-list">{availableAreas.map((area) => {
            const section = systemExam(station, area);
            return <li key={area}><strong>{EXAM_AREAS[area]}</strong>
              {section.recorded.map((item) => <p key={item.id}>{item.reply}</p>)}
              {section.reply && <><small>Complemento simulado</small><p>{section.reply}</p></>}
            </li>;
          })}</ul>
        </div> : <div className="findings"><h3><ClipboardList size={19}/> Hallazgos solicitados</h3>
          <span className="sr-only" role="status">{latestFinding && findings.find((item) => item.id === latestFinding)?.reply}</span>
          {findings.length ? <ul className="findings-list">{findings.map((item) => <li key={item.id} className={item.id === latestFinding ? 'latest' : ''}>
            <small>{item.kind === 'simulated' ? 'Resultado simulado' : item.kind === 'unavailable' ? 'Sin resultado' : labels[item.group]}</small>
            <strong>{item.label}</strong><p>{item.reply}</p>
          </li>)}</ul> : <p>Solicita una exploración o un paraclínico para ver su resultado aquí.</p>}
        </div>}
      </aside>
    </div>
    <section className="card station-options"><h2><Brain size={21}/> {phase === 2 ? 'Diagnóstico principal' : labels[centralGroup]}</h2><p>{phase === 0 ? station.scenario : 'Selecciona y registra tus decisiones durante la estación.'}</p>
      {phase === 1 ? <button type="button" className="button secondary" onClick={() => {
        setTool('exploracion');
        document.getElementById('station-clinical-tools')?.focus();
      }}>Ir a exploración física</button> :
        <div className="option-list">{station.interactions.filter((item) => item.group === centralGroup).map((item) =>
          <button key={item.id} className={'button secondary ' + (selected.includes(item.id) ? 'picked' : '')} aria-pressed={selected.includes(item.id)}
            disabled={saving || !canInteract || (centralGroup === 'acciones' && Boolean(evolution || evolving))} onClick={() => choose(item)}>{item.label}</button>)}</div>}
      {phase === 2 && <fieldset className="differential-options">
        <legend>Diagnósticos diferenciales</legend>
        <p>Considera hasta dos alternativas distintas del diagnóstico principal.</p>
        <div className="option-list">{diagnosis.filter((item) => !selected.includes(item.id)).map((item) => {
          const checked = differentials.includes(item.id);
          return <button type="button" key={item.id} className={'button secondary ' + (checked ? 'picked' : '')} aria-pressed={checked}
            disabled={!canInteract || saving || (!checked && differentials.length >= 2)} onClick={() => {
              const next = checked ? differentials.filter((id) => id !== item.id) : [...differentials, item.id];
              setDifferentials(next);
              saveDraft('differentials', JSON.stringify(next));
            }}>{item.label}</button>;
        })}</div>
      </fieldset>}
      {phase === 2 && <ReasoningFields diagnoses={hypotheses} observed={observed} notes={decisionDraft.reasoning} nextTest={decisionDraft.nextTest}
        disabled={!canInteract || saving} update={(note) => updateDecisions({ ...decisionDraft,
          reasoning: [...decisionDraft.reasoning.filter((previous) => previous.diagnosis !== note.diagnosis), note],
        })} updateTest={(nextTest) => updateDecisions({ ...decisionDraft, nextTest })}/>}
      {phase === 3 && <TreatmentFields options={station.treatmentOptions} value={decisionDraft.treatment}
        disabled={!canInteract || saving} update={(treatment) => updateDecisions({ ...decisionDraft, treatment })}/>}
    </section>
    {session.hasEvolution && (action || evolution) && <section className="card station-options">
      <h2><Activity size={21}/> Evolución del paciente</h2>
      {evolution ? <>
        <ul>{evolution.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul>
        <fieldset className="differential-options"><legend>¿Qué harías después?</legend>
          <div className="option-list">{(Object.keys(FOLLOW_UP) as FollowUp[]).map((decision) => <button type="button" key={decision}
            className={'button secondary ' + (followUp === decision ? 'picked' : '')} aria-pressed={followUp === decision}
            disabled={saving || !canInteract} onClick={() => { setFollowUp(decision); saveDraft('followup', decision); }}>{FOLLOW_UP[decision]}</button>)}</div>
        </fieldset>
      </> : <>
        <p>Al consultar la evolución se confirma la conducta seleccionada.</p>
        <button type="button" className="button secondary" disabled={saving || evolving || !canInteract || !action}
          onClick={() => { if (action) void revealEvolution(action); }}>{evolving ? 'Cargando…' : 'Consultar evolución'}</button>
      </>}
    </section>}
    {finishing && <section className="card station-options">
      <h2><FileText size={21}/> Justificación clínica</h2>
      <label htmlFor="station-justification">¿Qué hallazgo apoya tu diagnóstico y ayuda a distinguirlo de tus diferenciales?</label>
      <textarea id="station-justification" rows={3} value={justification} maxLength={JUSTIFICATION_LIMIT} disabled={!canInteract || saving}
        onChange={(event) => { setJustification(event.target.value); saveDraft('justification', event.target.value); }}/>
      <small>Opcional. Se mostrará junto a la retroalimentación.</small>
    </section>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <footer className="station-footer"><span><ClipboardList size={20}/> {session.index + 1} de 3 · Evaluación sobre 100</span>
      {finishing && <button type="button" className="button secondary" disabled={saving} onClick={() => setFinishing(false)}>Volver a la estación</button>}
      <button className="button primary" disabled={saving || paused || clockBusy || evolving} onClick={() => {
        if (finishing) void submit();
        else { voiceCall.stop(); stopDictation(); textRequest.current?.abort(); setFinishing(true); }
      }}>{saving ? 'Guardando…' : finishing ? 'Guardar y finalizar' : 'Finalizar estación'}</button></footer>
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
