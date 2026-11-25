import { evaluateReasoning, evaluateTreatment, validPrescriptionKey, validReasoningKey, validTreatmentOptions } from './decisions.mjs';

export const STATION_MS = 5 * 60 * 1000;
export const DAILY_CIRCUITS_DEFAULT = 5;
export const DAILY_CIRCUITS_MAX = 50;
export const PHASES = ['Anamnesis', 'Examen físico', 'Razonamiento', 'Tratamiento', 'Cierre'];
export const DOMAINS = [20, 20, 20, 25, 15];
export const GROUPS = ['anamnesis', 'exploracion', 'paraclinicos', 'razonamiento', 'acciones', 'cierre'];
export const CURRICULAR_GROUPS = ['A', 'B'];
export const SINGLE = ['razonamiento', 'acciones', 'cierre'];
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const short = (item, max) => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
export const validId = (id) => typeof id === 'string' && idPattern.test(id);
export const validCurricularGroups = (groups) => Array.isArray(groups) && groups.length <= CURRICULAR_GROUPS.length
  && new Set(groups).size === groups.length && groups.every((group) => CURRICULAR_GROUPS.includes(group));
export function validStudyResults(results) {
  return Array.isArray(results) && results.length <= 24
    && results.every((item) => item && validId(item.id) && short(item.label, 120) && short(item.value, 260)
      && (item.unit === '' || short(item.unit, 40)) && (item.reference === '' || short(item.reference, 120)))
    && new Set(results.map((item) => item.id)).size === results.length;
}

function validVaccinationCard(card) {
  return card && (card.summary === '' || short(card.summary, 260))
    && Array.isArray(card.doses) && card.doses.length <= 24 && Boolean(card.summary || card.doses.length)
    && card.doses.every((row) => row && short(row.vaccine, 100) && (row.dose === '' || short(row.dose, 60))
      && (row.date === '' || (/^\d{4}-\d{2}-\d{2}$/.test(row.date) && !Number.isNaN(Date.parse(row.date))
        && new Date(row.date).toISOString().slice(0, 10) === row.date)));
}

export function validCase(data, rubric) {
  if (!data || !rubric || !short(data.title, 110) || !short(data.category, 80)
      || !short(data.scenario, 750) || !short(data.opening, 750)
      || !['Baja', 'Media', 'Alta'].includes(data.difficulty)
      || !['draft', 'review', 'published'].includes(data.status)
      || (data.curricularGroups !== undefined && !validCurricularGroups(data.curricularGroups))
      || (data.studyResults !== undefined && !validStudyResults(data.studyResults))
      || (data.treatmentOptions !== undefined && !validTreatmentOptions(data.treatmentOptions))
      || (data.treatmentOptions !== undefined ? !validPrescriptionKey(rubric.prescription, data) : rubric.prescription !== undefined)
      || (data.interview !== undefined && (!Array.isArray(data.interview) || data.interview.length > 24
        || !data.interview.every((row) => row && short(row.question, 160) && short(row.reply, 400))))
      || (data.vaccinationCard !== undefined && !validVaccinationCard(data.vaccinationCard))
      || !Array.isArray(data.interactions) || data.interactions.length < 5 || data.interactions.length > 35
      || !short(rubric.diagnosis, 200) || !short(rubric.reference, 300)
      || (rubric.differentialNote !== undefined && rubric.differentialNote !== '' && !short(rubric.differentialNote, 400))
      || !Array.isArray(rubric.criteria) || rubric.criteria.length > 35
      || !Array.isArray(rubric.critical) || rubric.critical.length > 12) return false;
  const options = new Map();
  for (const interaction of data.interactions) {
    if (!interaction || !validId(interaction.id) || options.has(interaction.id)
      || !GROUPS.includes(interaction.group) || !short(interaction.label, 120)
      || !(interaction.reply === '' || short(interaction.reply, 500))) return false;
    if (SINGLE.includes(interaction.group) && interaction.reply !== '') return false;
    options.set(interaction.id, interaction);
  }
  if (rubric.reasoning !== undefined && !validReasoningKey(rubric.reasoning, data.interactions)) return false;
  const points = [0, 0, 0, 0, 0];
  const used = new Set();
  for (const criterion of rubric.criteria) {
    if (!criterion || !options.has(criterion.id) || used.has(criterion.id) || !short(criterion.tip, 260)
        || !Number.isInteger(criterion.domain) || criterion.domain < 0 || criterion.domain > 4
        || !Number.isInteger(criterion.points) || criterion.points <= 0) return false;
    const phase = ['anamnesis', 'exploracion', 'razonamiento', 'acciones', 'cierre'][criterion.domain];
    const group = options.get(criterion.id).group;
    if (group !== phase && !(phase === 'exploracion' && group === 'paraclinicos')) return false;
    used.add(criterion.id);
    points[criterion.domain] += criterion.points;
  }
  for (const [index, group] of ['razonamiento', 'acciones', 'cierre'].entries()) {
    if (rubric.criteria.filter((criterion) => criterion.domain === index + 2).length !== 1
      || data.interactions.filter((item) => item.group === group).length < 2) return false;
  }
  if (rubric.differentials !== undefined && (!Array.isArray(rubric.differentials) || rubric.differentials.length > 2
      || new Set(rubric.differentials).size !== rubric.differentials.length
      || rubric.differentials.some((id) => options.get(id)?.group !== 'razonamiento'
        || rubric.criteria.some((item) => item.domain === 2 && item.id === id)))) return false;
  return points.every((total, index) => total === DOMAINS[index]) && rubric.critical.every(
    (error) => error && options.has(error.id) && !used.has(error.id) && short(error.tip, 260)
  );
}

export function validAnswers(data, selections) {
  if (!Array.isArray(selections) || selections.length > data.interactions.length
      || new Set(selections).size !== selections.length) return false;
  const map = new Map(data.interactions.map((item) => [item.id, item.group]));
  const used = new Set();
  for (const id of selections) {
    const group = map.get(id);
    if (!group || (SINGLE.includes(group) && used.has(group))) return false;
    used.add(group);
  }
  return true;
}

export function grade(data, rubric, selections, differentials = [], { reasoning: notes, treatment: plan, nextTest } = {}) {
  const selected = new Set(selections);
  const domains = [0, 0, 0, 0, 0];
  const feedback = rubric.criteria.map((item) => {
    const earned = selected.has(item.id);
    if (earned) domains[item.domain] += item.points;
    return { label: data.interactions.find((interaction) => interaction.id === item.id).label, earned, tip: item.tip, domain: item.domain };
  });
  const critical = rubric.critical.filter((item) => selected.has(item.id)).map((item) => item.tip);
  const errors = data.interactions.filter((item) => selected.has(item.id) && SINGLE.includes(item.group)
    && !rubric.criteria.some((criterion) => criterion.id === item.id)).map((item) => item.label);
  const names = (ids) => ids.map((id) => data.interactions.find((item) => item.id === id)?.label).filter(Boolean);
  const expectedDifferentials = rubric.differentials ?? [];
  if (expectedDifferentials.length) {
    const matched = differentials.filter((id) => expectedDifferentials.includes(id)).length;
    domains[2] = (domains[2] > 0 ? 14 : 0) + 6 * matched / expectedDifferentials.length;
  }
  const reasoning = evaluateReasoning(data, rubric.reasoning, notes, nextTest);
  const treatment = evaluateTreatment(data, rubric.prescription, plan);
  if (reasoning.checks.length) domains[2] = Math.round(domains[2] * 0.8 + 4 * reasoning.checks.filter(({ earned }) => earned).length / reasoning.checks.length);
  if (treatment?.checks.length) domains[3] = (domains[3] > 0 ? 15 : 0)
    + Math.round(10 * treatment.checks.filter(({ earned }) => earned).length / treatment.checks.length);
  const score = domains.reduce((total, value) => total + value, 0);
  return { title: data.title, score, domains, feedback, critical, errors, passed: score >= 70 && critical.length === 0,
    diagnosis: rubric.diagnosis, reference: rubric.reference,
    ...(reasoning.entries.length || reasoning.checks.length || reasoning.nextTest ? { reasoning } : {}),
    ...(treatment ? { treatment } : {}),
    ...(differentials.length || expectedDifferentials.length ? {
      differentials: { chosen: names(differentials), expected: names(expectedDifferentials),
        ...(rubric.differentialNote ? { note: rubric.differentialNote } : {}) },
    } : {}) };
}

export function normalizeEmail(input) {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'+=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ? email : null;
}

export function readInvitations(source) {
  const rows = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (rows.length > 401) throw new Error('El CSV debe tener un máximo de 400 filas.');
  const emails = new Set();
  let records = 0;
  for (const [index, row] of rows.entries()) {
    const match = /^\s*(?:"([^"]+)"|([^,;]+))\s*$/.exec(row);
    const value = (match?.[1] ?? match?.[2] ?? '').trim();
    if (index === 0 && ['email', 'correo', 'correo electrónico'].includes(value.toLowerCase())) continue;
    const email = normalizeEmail(value);
    if (!email) throw new Error(`Correo inválido en la fila ${index + 1}. Usa una columna de correos.`);
    records++;
    if (records > 400) throw new Error('El CSV debe tener un máximo de 400 filas de correos.');
    emails.add(email);
  }
  if (!emails.size) throw new Error('El archivo no contiene correos.');
  return [...emails];
}

export { structured } from './dialogue.mjs';
