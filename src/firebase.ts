import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = Object.values(cfg).every(Boolean) ? initializeApp(cfg) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
const api = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export const apiReady = Boolean(api);

export async function signIn() {
  if (!auth) throw new Error('Firebase aún no está configurado.');
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function call<T>(user: User, path: string, body?: object, signal?: AbortSignal): Promise<T> {
  if (!api) throw new RequestError('El servicio de simulación aún no está configurado.', 503);
  const timeout = AbortSignal.timeout(14000);
  const response = await fetch(api + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + await user.getIdToken(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new RequestError(data?.error ?? 'El servicio no está disponible.', response.status);
  return data;
}

export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';
