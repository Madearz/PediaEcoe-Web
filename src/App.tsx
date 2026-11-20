import { useEffect, useState } from 'react';
import { Activity, BarChart3, BookOpen, BriefcaseMedical, Home, LogOut, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { useAccess, logout, type Access } from './auth';
import { Brand, GoogleIcon, HeroTag } from './Brand';
import { apiReady, signIn } from './firebase';
import { Cases, History, Profile, Resources } from './Student';
import { Circuit } from './Circuit';
import { Admin } from './Admin';

export const scene = import.meta.env.BASE_URL + 'consultorio.webp';

function Welcome({ access }: { access: Exclude<Access, { status: 'ready' }> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function google() {
    setBusy(true);
    setError('');
    try { await signIn(); }
    catch (failure) {
      const code = (failure as { code?: string }).code;
      setError(code === 'auth/popup-blocked' ? 'Permite las ventanas emergentes e inténtalo de nuevo.'
        : code === 'auth/unauthorized-domain' ? 'Este dominio debe autorizarse en Firebase Authentication.'
        : code === 'auth/popup-closed-by-user' ? 'Se cerró la ventana de Google.' : 'No fue posible iniciar sesión. Inténtalo de nuevo.');
    } finally { setBusy(false); }
  }
  return <main className="welcome">
    <section className="welcome-main">
      <Brand />
      <div className="welcome-copy">
        <HeroTag />
        <h1>Practica tu ECOE<br/>de pediatría.</h1>
        <p>Entrena la entrevista clínica, la exploración y la toma de decisiones con pacientes virtuales.</p>
        <div className="access-card">
          {access.status === 'loading' ? <p role="status">Verificando el acceso…</p> : access.status === 'denied' || access.status === 'error' ?
            <><h2>{access.status === 'denied' ? 'Acceso por invitación' : 'No se pudo verificar el acceso'}</h2>
              <p>{access.user?.email}</p>
              <p>{access.status === 'denied' ? 'Solicita a la administradora que habilite esta cuenta.' : 'Comprueba tu conexión y vuelve a cargar la página.'}</p>
              <button className="button secondary" onClick={() => void logout()}>Cambiar de cuenta</button></> :
            <><h2>Inicia sesión</h2><p>Usa la cuenta que recibió la invitación.</p>
              <button className="button google" disabled={busy || access.status === 'setup'} onClick={() => void google()}><GoogleIcon /> Continuar con Google</button>
              {access.status === 'setup' && <p role="status">El acceso se habilitará al conectar Firebase.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </>}
          <small className="lock"><ShieldCheck size={15} /> Plataforma privada para estudiantes</small>
        </div>
      </div>
    </section>
    <aside className="welcome-visual">
      <img src={scene} alt="Madre y niño en un consultorio pediátrico virtual" />
      <div className="welcome-caption"><Activity size={22} /><div><b>Entrenamiento clínico guiado</b><small>3 estaciones · 5 minutos por estación</small></div></div>
    </aside>
  </main>;
}

export function Avatar({ user }: { user: User }) {
  const [failed, setFailed] = useState(false);
  return user.photoURL?.startsWith('https://') && !failed ? <img className="avatar" alt="" src={user.photoURL} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="avatar initials" aria-hidden="true">{user.displayName?.trim().slice(0, 1).toUpperCase() || <UserRound size={20}/>}</span>;
}
const nav = [[Home, '/', 'Inicio'], [Stethoscope, '/simulador', 'Simulador ECOE'], [BriefcaseMedical, '/casos', 'Banco de casos'],
  [BarChart3, '/resultados', 'Mis resultados'], [BookOpen, '/guias', 'Rúbricas y guías'], [UserRound, '/perfil', 'Mi perfil']] as const;
function Dashboard({ user }: { user: User }) {
  return <main className="dashboard">
    <section className="dashboard-hero">
      <div><HeroTag /><h1>Hola, {user.displayName?.split(' ')[0] || 'estudiante'}.</h1>
        <p>Practica un circuito de tres estaciones con pacientes pediátricos simulados.</p>
        <Link className="button primary" to="/simulador"><Stethoscope size={19}/> Ir al simulador</Link>
      </div><img src={scene} alt="Consultorio pediátrico virtual" />
    </section>
    {!apiReady && <p className="notice">El banco y el perfil están disponibles. Para iniciar circuitos, conecta el Worker.</p>}
    <div className="summary-links"><Link className="card" to="/casos"><BriefcaseMedical/> <strong>Banco de casos</strong><span>Consulta los escenarios publicados.</span></Link>
      <Link className="card" to="/resultados"><BarChart3/> <strong>Mis resultados</strong><span>Consulta tus puntajes e historial.</span></Link>
      <Link className="card" to="/guias"><BookOpen/> <strong>Rúbricas y guías</strong><span>Conoce los criterios de evaluación.</span></Link></div>
  </main>;
}

export function App() {
  const access = useAccess();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  if (access.status !== 'ready') return <Welcome access={access} />;
  const { user, admin } = access;
  return <div className="layout" key={user.uid}>
    <aside className="sidebar"><Link to="/" aria-label="Inicio de PediaECOE AI"><Brand/></Link>
      <nav aria-label="Navegación principal">{nav.map(([Icon, path, label]) =>
        <NavLink key={path} to={path} end={path === '/'}><Icon size={21}/><span>{label}</span></NavLink>
      )}{admin && <NavLink to="/admin"><ShieldCheck size={21}/> Administración</NavLink>}</nav>
      <small className="sidebar-foot">Práctica clínica pediátrica</small>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="area-title">PediaECOE AI</span><Link className="userbox" to="/perfil"><Avatar user={user}/>
        <span><b>{user.displayName || 'Estudiante'}</b><small>{user.email}</small></span></Link>
        <button className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void logout()}><LogOut size={20}/></button>
      </header>
      <Routes>
        <Route index element={<Dashboard user={user}/>}/>
        <Route path="/simulador/*" element={<Circuit user={user}/>}/>
        <Route path="/casos" element={<Cases/>}/>
        <Route path="/resultados" element={<History user={user}/>}/>
        <Route path="/guias" element={<Resources/>}/>
        <Route path="/perfil" element={<Profile user={user}/>}/>
        {admin && <Route path="/admin" element={<Admin user={user}/>}/>}
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </div>
  </div>;
}
