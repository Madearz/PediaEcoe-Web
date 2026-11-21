import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Grade } from '../shared/clinical.mjs';
import { reviewFacts, reviewReply, type ReviewTurn } from '../shared/review.mjs';
import { call, messageOf, RequestError } from './firebase';

type Answer = { reply: string; mode: 'ai' | 'structured' };
const suggestions = ['¿Qué hice mal?', '¿Qué me faltó?', '¿Por qué ese diagnóstico?', '¿Cómo se calculó mi puntaje?'];

export function ReviewChat({ user, result, resultId }: { user: User; result: Grade; resultId: string }) {
  const inputId = useId();
  const headingId = useId();
  const request = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [turns, setTurns] = useState<(ReviewTurn & Answer)[]>([]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [pending, turns]);

  async function ask(input: string) {
    const question = input.trim();
    if (!question || request.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    const history = turns.slice(-2).map((turn) => ({ question: turn.question, reply: turn.reply.slice(0, 400) }));
    request.current = controller;
    setText((previous) => previous.trim() === question ? '' : previous);
    setPending(question);
    setError('');
    try {
      let answer: Answer;
      try {
        answer = await call(user, '/reviews/' + encodeURIComponent(resultId), { question, history }, signal);
      } catch (failure) {
        signal.throwIfAborted();
        if (failure instanceof RequestError && [400, 401, 403, 404].includes(failure.status)) throw failure;
        answer = { reply: reviewReply(reviewFacts(result), question, history), mode: 'structured' };
      }
      if (!signal.aborted) setTurns((previous) => [...previous, { question, ...answer }]);
    } catch (failure) {
      if (!signal.aborted) {
        setError(messageOf(failure));
        setText((previous) => previous || question);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!signal.aborted) setPending('');
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(text);
  }

  return <section className="review-chat" aria-labelledby={headingId}>
    <h3 id={headingId}><MessageCircle size={19}/> Chat de revisión</h3>
    <p>Pregunta por tus decisiones, lo que omitiste y cómo mejorar en este caso.</p>
    <div className="review-suggestions" aria-label="Preguntas sugeridas">
      {suggestions.map((question) => <button type="button" className="button secondary" key={question} disabled={Boolean(pending)}
        onClick={() => void ask(question)}>{question}</button>)}
    </div>
    <div ref={log} role="log" aria-label="Conversación de revisión" className="review-log">
      {turns.map((turn, index) => <div className="review-turn" key={index}>
        <p className="review-student"><strong>Tú</strong>{turn.question}</p>
        <p className="review-answer"><strong>{turn.mode === 'ai' ? 'Tutor ECOE · IA' : 'Tutor ECOE · Rúbrica'}</strong>{turn.reply}</p>
      </div>)}
      {pending && <div className="review-turn"><p className="review-student"><strong>Tú</strong>{pending}</p><p role="status">Revisando tu evaluación…</p></div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <form className="review-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>Tu pregunta sobre el caso</label>
      <input id={inputId} placeholder="Ej. ¿Por qué mi conducta fue incorrecta?" maxLength={400}
        value={text} onChange={(event) => setText(event.target.value)}/>
      <button type="submit" className="button primary" disabled={!text.trim() || Boolean(pending)}><Send size={17}/> Enviar</button>
    </form>
  </section>;
}
