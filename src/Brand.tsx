import { useState } from 'react';
import { AudioLines, HeartPulse, Stethoscope } from 'lucide-react';

export function Brand() {
  const [failed, setFailed] = useState(false);
  const logo = import.meta.env.VITE_BRAND_LOGO;
  if (logo && !failed) return <img className="brand-original" src={import.meta.env.BASE_URL + logo} onError={() => setFailed(true)} alt="PediaECOE AI · Simulador de ECOE de Pediatría"/>;
  return <div className="brand">
    <div className="brand-icon"><Stethoscope /><span><AudioLines size={12} /></span></div>
    <div><strong>Pedia<b>ECOE</b> <i>AI</i></strong><small>Simulador de ECOE de Pediatría</small></div>
  </div>;
}
export function GoogleIcon() {
  return <svg width="21" height="21" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.2 3.6l6.86-6.86C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8 6.21C12.45 13.73 17.75 9.5 24 9.5Z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.79 7.17l7.73 6C44.4 38.08 46.98 31.95 46.98 24.55Z"/>
    <path fill="#FBBC05" d="M10.53 28.57A14.45 14.45 0 0 1 9.75 24c0-1.59.27-3.12.75-4.57l-8-6.21A23.9 23.9 0 0 0 0 24c0 3.88.93 7.55 2.56 10.78l7.97-6.21Z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.81l-7.73-6c-2.15 1.45-4.93 2.31-8.18 2.31-6.25 0-11.55-4.23-13.47-9.93l-8 6.21C6.51 42.62 14.62 48 24 48Z"/>
  </svg>;
}
export function HeroTag() { return <span className="hero-tag"><HeartPulse size={16} /> Simulación pediátrica</span>; }
