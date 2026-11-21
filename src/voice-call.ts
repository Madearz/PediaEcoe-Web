export type CallPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused';
export type CallState = { phase: CallPhase; muted: boolean; error?: string };
type Conversation = {
  listen: (signal: AbortSignal) => Promise<string>;
  answer: (question: string, signal: AbortSignal) => Promise<string>;
  say: (text: string, signal: AbortSignal) => Promise<void>;
  change: (state: CallState) => void;
};
type Connection = { abort: AbortController; muted: boolean; listener?: AbortController };

export function createVoiceCall({ listen, answer, say, change }: Conversation) {
  let connection: Connection | undefined;
  let phase: CallPhase = 'idle';
  function show(state: CallState) {
    phase = state.phase;
    change(state);
  }
  const current = (call: Connection) => connection === call && !call.abort.signal.aborted;

  function end(error?: string) {
    const call = connection;
    connection = undefined;
    call?.listener?.abort();
    call?.abort.abort();
    show({ phase: 'idle', muted: false, error });
  }

  async function next(call: Connection) {
    if (!current(call)) return;
    if (call.muted) { show({ phase: 'paused', muted: true }); return; }
    const listener = new AbortController();
    call.listener = listener;
    show({ phase: 'listening', muted: false });
    try {
      const question = (await listen(listener.signal)).trim().slice(0, 400);
      if (!current(call) || call.listener !== listener) return;
      call.listener = undefined;
      if (!question) {
        call.muted = true;
        show({ phase: 'paused', muted: true, error: 'No se detectó voz. Pulsa Reanudar micrófono para seguir.' });
        return;
      }
      show({ phase: 'thinking', muted: call.muted });
      const reply = await answer(question, call.abort.signal);
      if (!current(call)) return;
      show({ phase: 'speaking', muted: call.muted });
      await say(reply, call.abort.signal);
      if (current(call)) void next(call);
    } catch (error) {
      if (!current(call) || listener.signal.aborted) return;
      end(error instanceof Error ? error.message : 'La llamada se interrumpió. Puedes escribir tu pregunta.');
    }
  }

  return {
    start() {
      if (connection) return;
      connection = { abort: new AbortController(), muted: false };
      void next(connection);
    },
    stop() { if (connection) end(); },
    toggleMute() {
      const call = connection;
      if (!call) return;
      call.muted = !call.muted;
      if (call.listener) {
        const listener = call.listener;
        call.listener = undefined;
        listener.abort();
        show({ phase: 'paused', muted: true });
      } else if (!call.muted && phase === 'paused') {
        void next(call);
      } else {
        show({ phase, muted: call.muted });
      }
    },
  };
}
