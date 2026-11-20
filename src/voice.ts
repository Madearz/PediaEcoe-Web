import { useEffect, useRef, useState } from 'react';

type VoiceEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type VoiceRecognizer = { lang: string; start(): void; abort(): void; onresult: ((event: VoiceEvent) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null };
type VoiceConstructor = new () => VoiceRecognizer;
const browser = window as Window & { SpeechRecognition?: VoiceConstructor; webkitSpeechRecognition?: VoiceConstructor };
const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
export const canSpeak = 'speechSynthesis' in window;

export function useVoice(onText: (text: string) => void) {
  const ref = useRef<VoiceRecognizer | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const stop = () => { ref.current?.abort(); ref.current = null; setListening(false); };
  useEffect(() => () => { ref.current?.abort(); if (canSpeak) window.speechSynthesis.cancel(); }, []);
  function toggle() {
    if (ref.current) { stop(); return; }
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'es-CO';
    recognition.onresult = (event) => { if (ref.current === recognition) onText(event.results[0][0].transcript.slice(0, 400)); };
    recognition.onerror = () => { if (ref.current === recognition) setVoiceError('El micrófono no está disponible. Puedes escribir tu pregunta.'); };
    recognition.onend = () => { if (ref.current === recognition) { ref.current = null; setListening(false); } };
    try { ref.current = recognition; recognition.start(); setListening(true); setVoiceError(''); }
    catch { ref.current = null; setVoiceError('No se pudo activar el micrófono. Puedes escribir tu pregunta.'); }
  }
  return { available: Boolean(Recognition), listening, voiceError, toggle, stop };
}

export function speak(text: string) {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const item = new SpeechSynthesisUtterance(text);
  item.lang = 'es-CO';
  item.voice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('es')) ?? null;
  window.speechSynthesis.speak(item);
}
