import { DOMAINS } from './clinical.mjs';
import { normalizeClinicalRequest } from './exam.mjs';

export const JUSTIFICATION_LIMIT = 500;
export const FOLLOW_UP = { reevaluar: 'Reevaluar', observar: 'Mantener observación', escalar: 'Escalar la atención' };
export const PRACTICE_TIPS = [
  'Organiza la entrevista en inicio, evolución y antecedentes pertinentes.',
  'Solicita los hallazgos que ayudan a distinguir tus hipótesis.',
  'Compara tus hipótesis con los hallazgos a favor y en contra.',
  'Prioriza la primera medida y plantea cuándo reevaluar.',
  'Explica el plan, verifica que se entendió y acuerda el seguimiento.',
];

const topics = {
  inicio: /\b(?:inicio|duracion|cronologia|desde cuando|hace cuanto|cuando (?:le |lo )?(?:empez|comenz|inicio)|cuanto (?:duro|tiempo))/,
  evolucion: /\b(?:evolucion|progresion|empeor|mejor|cambio|recurren|ha vuelto|le ha pasado|se repit|otra vez)/,
  respiracion: /\b(?:respir|tos\b|tose|tiraje|ahoga|silbid|sibilan|est[aá] agitado)/,
  fiebre: /\b(?:fiebre|febril|temperatura|caliente)/,
  alimentacion: /\b(?:aliment|tomas?\b|tomando|comer|come\b|leche|pecho|ingesta|bebe\b|dieta)/,
  tolerancia: /\b(?:tolerancia|tolera|retiene|aguanta|se queda con|puede beber)/,
  orina: /\b(?:diuresis|orin|miccion|panal|pipi)/,
  apnea: /\b(?:apnea|pausas? (?:al |de )?respir|deja de respirar|dejo de respirar)/,
  vomito: /\b(?:vomit|emesis)/,
  deposiciones: /\b(?:diarrea|deposicion|popo|heces|evacua)/,
  hidratacion: /\b(?:hidrat|sed\b|boca seca|liquidos)/,
  medicamento: /\b(?:medicamento|farmaco|tratamiento|medicina|remedio|jarabe|dosis|hierro)/,
  adherencia: /\b(?:adherencia|forma de uso|como (?:le )?(?:da|toma|administra|usa)|olvida|regularidad|se lo da|ha dejado)/,
  antecedentes: /\b(?:antecedente|enfermedad cronica|enfermedad previa|tiene alguna enfermedad|sufre de algo)/,
  alergia: /\b(?:alerg|reaccion a)/,
  vacunas: /\b(?:vacun|inmuniz|esquema de|carnet?\b)/,
  piel: /\b(?:piel|exantema|sarpullid|erupci|roncha|vesicul|mancha|granito|brote|costra|lesion)/,
  ganglios: /\b(?:ganglio|adenopat|adenomegal|bulto|bolita)/,
  dolor: /\b(?:dolor|duele|molestia|donde le duele)/,
  sangrado: /\b(?:sangr|perdida de sangre|hemorrag)/,
  contacto: /\b(?:contacto|exposicion|estuvo con|viaj|alguien enfermo)/,
  embarazo: /\b(?:embarazo|prenatal|perinatal|nacimiento|nacio|parto)/,
  episodios: /\b(?:episodios? previos?|crisis previas|le ha pasado antes|primera vez|ya habia pasado)/,
  conciencia: /\b(?:conciencia|somnolen|alerta|desmay|se quedo dormido|le cuesta despertar)/,
};

function topicsIn(text) {
  return Object.keys(topics).filter((key) => topics[key].test(text));
}

export function registerAnamnesis(interactions, question, previous = []) {
  const text = normalizeClinicalRequest(question);
  const history = interactions.filter((item) => item.group === 'anamnesis');
  const exact = history.filter((item) => text === normalizeClinicalRequest(item.label));
  const questionLike = question.includes('?') || /\b(?:que|como|cuando|desde|cuanto|tien|han|puede|cuent|not|come|orina|bebe|esta)\w*\b/.test(text);
  const mentioned = questionLike ? topicsIn(text) : [];
  const recent = previous.filter((key) => key.startsWith('last:')).map((key) => key.slice(5));
  const inferred = mentioned.length === 1 && ['inicio', 'evolucion'].includes(mentioned[0]);
  const current = inferred ? [...mentioned, ...recent] : mentioned;
  if (!current.length && !exact.length) return { evidence: previous, registered: [] };
  const candidates = history.map((item) => {
    const label = normalizeClinicalRequest(item.label);
    const parts = item.label.split(/,|\s+y\s+|\s+e\s+/i).map((part) => topicsIn(normalizeClinicalRequest(part)));
    return { id: item.id, exact: label === text, parts, keys: parts.map((part) => part.join('+')), complete: parts.every((part) => part.length) };
  });
  const covered = new Set(candidates.flatMap((item) => item.parts
    .filter((part) => part.length && part.every((key) => current.includes(key))).map((part) => part.join('+'))));
  const fresh = [...covered].filter((key) => !previous.includes(key));
  const last = (inferred ? recent : mentioned).filter((key) => !['inicio', 'evolucion'].includes(key)).map((key) => 'last:' + key);
  const evidence = [...new Set([...previous.filter((key) => !key.startsWith('last:')), ...covered, ...last])];
  const registered = candidates.filter((item) => (item.exact && exact.length === 1) || (item.complete && item.keys.some((key) => fresh.includes(key))
    && item.keys.every((key) => evidence.includes(key))
    && candidates.filter((other) => other.keys.join() === item.keys.join()).length === 1)).map(({ id }) => id);
  return { evidence, registered };
}

export function practiceFocus(results) {
  const recent = results.slice(0, 12).filter((item) => Array.isArray(item.domains)
    && DOMAINS.every((max, index) => Number.isFinite(item.domains[index]) && item.domains[index] >= 0 && item.domains[index] <= max));
  if (!recent.length) return null;
  const strengths = DOMAINS.map((max, index) => recent.reduce((total, item) => total + item.domains[index] / max, 0) / recent.length);
  const index = strengths.indexOf(Math.min(...strengths));
  if (strengths[index] === 1) return null;
  const result = recent.find((item) => item.domains[index] < DOMAINS[index] && item.caseId)
    ?? recent.find((item) => item.domains[index] < DOMAINS[index]);
  return { index, sampleSize: recent.length, result };
}
