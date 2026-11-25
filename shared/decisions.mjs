const text = (value, limit = 160) => typeof value === 'string' && value.length <= limit;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function validTreatmentOptions(options) {
  return Array.isArray(options) && options.length >= 2 && options.length <= 6
    && options.every((row) => record(row) && typeof row.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.id)
      && text(row.label, 240) && row.label.trim())
    && new Set(options.map(({ id }) => id)).size === options.length
    && new Set(options.map(({ label }) => label.trim().toLowerCase())).size === options.length;
}

export function validPrescriptionKey(value, data) {
  if (!record(value) || !validTreatmentOptions(data.treatmentOptions)) return false;
  const ids = new Set(data.treatmentOptions.map(({ id }) => id));
  return Array.isArray(value.accepted) && value.accepted.length > 0 && value.accepted.length < ids.size
    && new Set(value.accepted).size === value.accepted.length && value.accepted.every((id) => ids.has(id))
    && text(value.source, 300) && value.source.trim() && text(value.explanation ?? '', 400);
}

export function validTreatmentPlan(plan, options = []) {
  return record(plan) && Object.keys(plan).every((key) => key === 'option' || key === 'monitor')
    && (plan.option === undefined || plan.option === '' || options.some(({ id }) => id === plan.option))
    && text(plan.monitor ?? '', 350);
}

export function validReasoningNotes(notes, diagnoses, observed) {
  return Array.isArray(notes) && notes.length <= 3 && new Set(notes.map((item) => item?.diagnosis)).size === notes.length
    && notes.every((item) => record(item) && diagnoses.includes(item.diagnosis) && text(item.for ?? '', 160) && text(item.against ?? '', 160)
      && (!item.support || observed.includes(item.support)) && (!item.counter || observed.includes(item.counter))
      && (!item.support || item.support !== item.counter));
}

export function validReasoningKey(key, interactions) {
  if (!Array.isArray(key) || !key.length || key.length > 3 || new Set(key.map((row) => row?.diagnosis)).size !== key.length) return false;
  const observed = new Set(interactions.filter(({ group }) => ['anamnesis', 'exploracion', 'paraclinicos'].includes(group)).map(({ id }) => id));
  const diagnoses = new Set(interactions.filter(({ group }) => group === 'razonamiento').map(({ id }) => id));
  return key.every((row) => record(row) && diagnoses.has(row.diagnosis) && ['support', 'counter'].every((kind) =>
    row[kind] === undefined || Array.isArray(row[kind]) && row[kind].length > 0 && row[kind].length <= 8 && row[kind].every((id) => observed.has(id)))
    && (row.support || row.counter));
}

export function evaluateReasoning(data, key = [], notes = [], nextTest) {
  const label = (id) => data.interactions.find((item) => item.id === id)?.label;
  const entries = notes.map((row) => ({ diagnosis: label(row.diagnosis), ...(row.support ? { support: label(row.support) } : {}),
    ...(row.counter ? { counter: label(row.counter) } : {}), ...(row.for?.trim() ? { for: row.for.trim() } : {}),
    ...(row.against?.trim() ? { against: row.against.trim() } : {}) }));
  const checks = key.flatMap((row) => ['support', 'counter'].filter((kind) => row[kind]).map((kind) => ({
    label: `${label(row.diagnosis)} · hallazgo ${kind === 'support' ? 'a favor' : 'en contra'}`,
    earned: row[kind].includes(notes.find((note) => note.diagnosis === row.diagnosis)?.[kind]),
    tip: row[kind].map(label).join(' · '),
  })));
  return { entries, checks, ...(nextTest?.trim() ? { nextTest: nextTest.trim() } : {}) };
}

export function evaluateTreatment(data, key, plan) {
  const chosen = data.treatmentOptions?.find(({ id }) => id === plan?.option);
  const monitor = plan?.monitor?.trim();
  if (!key && !chosen && !monitor) return null;
  const submitted = { ...(chosen ? { choice: chosen.label } : {}), ...(monitor ? { monitor } : {}) };
  if (!key) return { submitted, checks: [] };
  const accepted = data.treatmentOptions.filter(({ id }) => key.accepted.includes(id));
  return {
    submitted,
    checks: [{ label: 'Pauta prescrita', earned: Boolean(chosen && key.accepted.includes(chosen.id)),
      tip: accepted.map(({ label }) => label).join(' · ') }],
    source: key.source,
    ...(key.explanation?.trim() ? { explanation: key.explanation.trim() } : {}),
  };
}
