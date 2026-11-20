import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const serviceTokens = new Map();
const publishedCatalogs = new Map();
const oauth = 'https://oauth2.googleapis.com/token';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function verifyGoogleToken(token, project, keySet = keys) {
  if (!project) throw new ApiError(503, 'Falta configurar Firebase.');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      issuer: `https://securetoken.google.com/${project}`, audience: project, algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'auth_time'], clockTolerance: 5,
    }));
  } catch {
    throw new ApiError(401, 'Inicia sesión con Google para continuar.');
  }
  if (payload.email_verified !== true || payload.firebase?.sign_in_provider !== 'google.com'
      || typeof payload.email !== 'string' || typeof payload.sub !== 'string' || !payload.sub
      || payload.sub.length > 128 || payload.sub.includes('/') || !Number.isFinite(payload.auth_time)
      || payload.auth_time > Date.now() / 1000 + 5 || payload.iat > Date.now() / 1000 + 5) {
    throw new ApiError(401, 'Se requiere una cuenta de Google verificada.');
  }
  return { uid: payload.sub, email: payload.email.toLowerCase() };
}

async function serviceToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new ApiError(503, 'El servidor de evaluación requiere configuración.');
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  if (account.project_id !== env.FIREBASE_PROJECT_ID) throw new ApiError(503, 'El proyecto del servidor no coincide.');
  const key = account.client_email + account.private_key_id;
  const current = serviceTokens.get(key);
  if (current && current.expiry > Date.now()) return current.pending;
  const pending = (async () => {
    const privateKey = await importPKCS8(account.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256', kid: account.private_key_id })
      .setIssuer(account.client_email).setAudience(oauth).setIssuedAt().setExpirationTime('55m').sign(privateKey);
    const response = await fetch(oauth, { method: 'POST', body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion,
    }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new ApiError(503, 'El servidor no pudo autenticarse con Firestore.');
    return (await response.json()).access_token;
  })();
  serviceTokens.set(key, { pending, expiry: Date.now() + 45 * 60_000 });
  try { return await pending; } catch (error) { serviceTokens.delete(key); throw error; }
}

const mapValues = (object, operation) => Object.fromEntries(Object.entries(object ?? {}).map(([key, value]) => [key, operation(value)]));
function encode(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: mapValues(value, encode) } };
}
function decode(value) {
  if ('integerValue' in value) return Number(value.integerValue);
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value) return mapValues(value.mapValue.fields, decode);
  return Object.values(value)[0];
}
const decoded = (document) => ({ name: document.name, updateTime: document.updateTime, data: mapValues(document.fields, decode) });

export function firestore(env, idToken) {
  const database = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`;
  const root = `https://firestore.googleapis.com/v1/${database}/documents`;
  const encoded = (path) => path.split('/').map(encodeURIComponent).join('/');
  async function send(path, options, privileged) {
    const token = privileged ? await serviceToken(env) : idToken;
    return fetch(root + path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
  }
  return {
    async get(path, privileged = false, missingStatus = 404) {
      const response = await send('/' + encoded(path), {}, privileged);
      if (!response.ok) {
        if ([403, 404].includes(response.status) && !privileged) throw new ApiError(missingStatus, 'El recurso no está disponible para esta cuenta.');
        if (response.status === 404) throw new ApiError(404, 'El recurso solicitado no existe.');
        throw new ApiError(503, 'Firestore no está disponible.');
      }
      return decoded(await response.json());
    },
    async published(refresh = false) {
      const cached = publishedCatalogs.get(database);
      if (!refresh && cached && cached.expires > Date.now()) return cached.ids;
      const response = await send(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
        select: { fields: [{ fieldPath: '__name__' }] },
        from: [{ collectionId: 'case_bank' }],
        where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
        limit: 400,
      } }) }, false);
      if (!response.ok) throw new ApiError(response.status === 403 ? 403 : 503, 'El banco de casos no está disponible.');
      const ids = (await response.json()).flatMap((row) => row.document ? [row.document.name.split('/').at(-1)] : []);
      publishedCatalogs.set(database, { ids, expires: Date.now() + 90_000 });
      return ids;
    },
    write(path, data, currentDocument) {
      return { update: { name: `${database}/documents/${path}`, fields: mapValues(data, encode) }, currentDocument };
    },
    progress(uid, changes) {
      return { transform: { document: `${database}/documents/student_progress/${uid}`, fieldTransforms: [
        ...Object.entries(changes).map(([fieldPath, number]) => ({ fieldPath, increment: encode(number) })),
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ] } };
    },
    async commit(writes, invitation) {
      const response = await send(':commit', { method: 'POST', body: JSON.stringify({
        writes: [{ verify: invitation.name, currentDocument: { updateTime: invitation.updateTime } }, ...writes],
      }) }, true);
      if (!response.ok) {
        const status = (await response.json().catch(() => null))?.error?.status;
        if (['FAILED_PRECONDITION', 'ABORTED', 'ALREADY_EXISTS', 'NOT_FOUND'].includes(status)) {
          throw new ApiError(409, 'El acceso o la sesión cambió. Actualiza e inténtalo de nuevo.');
        }
        throw new ApiError(503, 'No se pudieron guardar los resultados.');
      }
    },
  };
}
