import { useCallback, useEffect, useRef, useState } from 'react';

type VoiceEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>>;
};
type VoiceRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult: ((event: VoiceEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type VoiceConstructor = new () => VoiceRecognizer;
const browser = typeof window === 'undefined' ? undefined :
  window as Window & { SpeechRecognition?: VoiceConstructor; webkitSpeechRecognition?: VoiceConstructor };
const Recognition = browser?.SpeechRecognition ?? browser?.webkitSpeechRecognition;
export const canListen = Boolean(Recognition);
export const canSpeak = Boolean(browser?.speechSynthesis);

function recognitionError(code: string) {
  if (['not-allowed', 'service-not-allowed'].includes(code)) return 'Permite el micrófono en el navegador para usar la llamada.';
  if (code === 'audio-capture') return 'El navegador no encontró un micrófono. Puedes escribir tu pregunta.';
  return 'El reconocimiento de voz se interrumpió. Puedes volver a intentar o escribir tu pregunta.';
}

export function listenForQuestion(signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    if (!Recognition) { reject(new Error('Este navegador no ofrece reconocimiento de voz.')); return; }
    const recognizer = new Recognition();
    recognizer.lang = 'es-CO';
    recognizer.continuous = false;
    recognizer.interimResults = false;
    let transcript = '';
    let finished = false;

    function finish(error?: unknown) {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      recognizer.onresult = null;
      recognizer.onerror = null;
      recognizer.onend = null;
      if (error) reject(error);
      else resolve(transcript.trim().slice(0, 400));
    }
    function abort() {
      finish(signal.reason);
      recognizer.abort();
    }

    recognizer.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal && result[0]?.transcript) transcript += ' ' + result[0].transcript;
      }
    };
    recognizer.onerror = ({ error }) => finish(error === 'no-speech' ? undefined : new Error(recognitionError(error)));
    recognizer.onend = () => finish();
    signal.addEventListener('abort', abort, { once: true });
    try { recognizer.start(); }
    catch { finish(new Error('No se pudo activar el micrófono. Puedes escribir tu pregunta.')); }
  });
}

export function playSpeech(text: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const synthesis = browser?.speechSynthesis;
    if (signal?.aborted) { reject(signal.reason); return; }
    if (!synthesis) { reject(new Error('Este navegador no ofrece reproducción por voz.')); return; }
    synthesis.cancel();
    const item = new SpeechSynthesisUtterance(text);
    item.lang = 'es-CO';
    item.voice = synthesis.getVoices().find((voice) => voice.localService && voice.lang.startsWith('es'))
      ?? synthesis.getVoices().find((voice) => voice.lang.startsWith('es')) ?? null;

    function finish(error?: unknown) {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      item.onend = null;
      item.onerror = null;
      if (error) reject(error);
      else resolve();
    }
    function abort() {
      finish(signal?.reason);
      synthesis?.cancel();
    }

    const timer = window.setTimeout(() => {
      finish(new Error('La voz del familiar no respondió. Puedes leer la respuesta y seguir por escrito.'));
      synthesis.cancel();
    }, Math.min(60_000, Math.max(12_000, text.length * 100)));
    item.onend = () => finish();
    item.onerror = () => finish(new Error('No se pudo reproducir la voz del familiar. La respuesta está disponible en texto.'));
    signal?.addEventListener('abort', abort, { once: true });
    try { synthesis.speak(item); }
    catch { finish(new Error('No se pudo reproducir la voz del familiar.')); }
  });
}

export function useVoice(onText: (text: string) => void) {
  const ref = useRef<AbortController | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const stop = useCallback(() => {
    const current = ref.current;
    ref.current = null;
    current?.abort();
    setListening(false);
  }, []);
  useEffect(() => () => ref.current?.abort(), []);
  function toggle() {
    if (ref.current) { stop(); return; }
    if (!canListen) return;
    const current = new AbortController();
    ref.current = current;
    setListening(true);
    setVoiceError('');
    void listenForQuestion(current.signal).then((text) => {
      if (ref.current === current && text) onText(text);
    }).catch((error: unknown) => {
      if (ref.current === current && !current.signal.aborted) {
        setVoiceError(error instanceof Error ? error.message : 'No se pudo activar el micrófono.');
      }
    }).finally(() => { if (ref.current === current) stop(); });
  }
  return { available: canListen, listening, voiceError, toggle, stop };
}

export function speak(text: string) {
  if (canSpeak) void playSpeech(text).catch(() => {});
}
