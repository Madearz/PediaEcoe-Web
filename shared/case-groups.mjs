import { CURRICULAR_GROUPS, validCurricularGroups } from './clinical.mjs';
import catalog from './case-group-catalog.mjs';

const byGroup = { A: new Set(catalog.A), B: new Set(catalog.B) };

export async function caseGroups(id, savedGroups, reference = '') {
  if (validCurricularGroups(savedGroups)) {
    return CURRICULAR_GROUPS.filter((group) => savedGroups.includes(group));
  }
  const references = new Set([...reference.matchAll(/\bGrupo\s+([AB])\b/gi)].map(([, group]) => group.toUpperCase()));
  if (references.size) return CURRICULAR_GROUPS.filter((group) => references.has(group));
  const bytes = new TextEncoder().encode(id);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const key = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return CURRICULAR_GROUPS.filter((group) => byGroup[group].has(key));
}
