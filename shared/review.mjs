import { DOMAINS, PHASES, SINGLE } from './clinical.mjs';

const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const domainPatterns = [/anamnes|entrevist|pregunt/, /explora|examen|paraclinic/, /razonamiento|diagnost/, /tratamiento|conducta/, /cierre|comunic/];
const ignored = new Set(['explica', 'explicame', 'porque', 'cual', 'cuales', 'sobre', 'caso', 'estacion',
  'puedo', 'puedes', 'cualquiera', 'deberia', 'entender', 'tengo', 'cuentame']);

export function reviewFacts(result, snapshot) {
  const { public: station, rubric } = snapshot ?? {};
  const answers = new Map(station?.interactions?.map((item) => [item.id, item]) ?? []);
  const expectedByGroup = new Map();
  for (const criterion of rubric?.criteria ?? []) {
    const option = answers.get(criterion.id);
    if (option && SINGLE.includes(option.group)) expectedByGroup.set(option.group, { label: option.label, tip: criterion.tip });
  }
  const decisions = (result.errors ?? []).map((label) => {
    const matches = (station?.interactions ?? []).filter((item) => item.label === label && SINGLE.includes(item.group));
    return { label, expected: matches.length === 1 ? expectedByGroup.get(matches[0].group) : undefined };
  });
  return { result, decisions, scenario: station?.scenario, opening: station?.opening,
    observations: (station?.interactions ?? []).filter((item) => item.reply).map(({ label, reply }) => ({ label, reply })) };
}

function bestMatch(entries, question) {
  const words = [...new Set(normalize(question).match(/[a-z]{4,}/g) ?? [])].filter((word) => !ignored.has(word));
  let match;
  let best = 0;
  for (const entry of entries) {
    const label = normalize(entry.label);
    const score = words.reduce((total, word) => total + (label.includes(word) ? 1 : 0), 0);
    if (score > best) { best = score; match = entry; }
  }
  return match;
}

function decisionText(item) {
  return item.expected
    ? `Marcaste «${item.label}». La opción esperada era «${item.expected.label}». ${item.expected.tip}`
    : `La rúbrica registró «${item.label}» como una decisión incorrecta. Puedes revisar la conducta esperada en los criterios de esta estación.`;
}
const bullets = (items) => items.map((item) => `• ${item}`).join('\n');

export function reviewReply(facts, question, history = []) {
  const { result, decisions, scenario, opening, observations } = facts;
  const text = normalize(question);
  const followUp = /^(?:[¿¡] ?)?(?:y )?(?:por que|como asi|explicame mas|dame mas detalle)[?!. ]*$/i.test(text);
  const topic = followUp && history.at(-1) ? history.at(-1).question : question;
  const intent = normalize(topic);
  const omitted = result.feedback.filter((item) => !item.earned);
  const matchesError = bestMatch(decisions, topic);
  const matchesCriterion = bestMatch(result.feedback, topic);
  const matchesObservation = bestMatch(observations, topic);
  const domain = domainPatterns.findIndex((pattern) => pattern.test(intent));
  if (/referencia|bibliograf|fuente|donde estudiar|que estudio/.test(intent)) return `La referencia del caso es: ${result.reference}`;
  if (/critico|seguridad|riesgo de mi/.test(intent)) return result.critical.length
    ? `La rúbrica señaló estos errores críticos:\n${bullets(result.critical.slice(0, 4))}`
    : 'Este intento no registra errores críticos. Puedes revisar también las decisiones incorrectas y los criterios pendientes.';
  if (result.treatment && /\b(?:dosis|pauta|prescripcion|volumen|mg|ml)\b/.test(intent)) {
    const expected = result.treatment.checks[0];
    const choice = result.treatment.submitted.choice;
    if (expected) return [`Tu pauta: ${choice || 'sin seleccionar'}.`, `Pauta aceptada: ${expected.tip}`,
      result.treatment.explanation].filter(Boolean).join(' ');
  }
  if (result.reasoning?.checks.length && /hallazgo|razonamiento|evidencia/.test(intent)) {
    return bullets(result.reasoning.checks.slice(0, 5).map((item) => `${item.label}. ${item.earned ? 'Registrado.' : 'Pendiente.'} Aceptado: ${item.tip}.`));
  }
  if (matchesError && !/puntaje|puntuacion|calificacion/.test(intent)) return decisionText(matchesError);
  if (/fall|error|mal\b|incorrect/.test(intent)) {
    const items = decisions.slice(0, 4).map(decisionText);
    if (result.critical.length) items.push(...result.critical.slice(0, 3));
    if (items.length) return `Estas son las decisiones y alertas registradas:\n${bullets(items)}`;
    return omitted.length ? 'No hay decisiones incorrectas registradas. Sí hay acciones de la rúbrica que quedaron sin registrar. Pregúntame qué te faltó.'
      : 'La evaluación no registra decisiones incorrectas ni criterios pendientes en este intento.';
  }
  if (/diagnost|hipotesis/.test(intent)) {
    const detail = result.feedback.find((item) => item.domain === 2)
      ?? bestMatch(result.feedback, result.diagnosis);
    return `El diagnóstico esperado en la estación era «${result.diagnosis}».${detail ? ' ' + detail.tip : ''}`;
  }
  if (/falt|omit|mejor|practic|repas/.test(intent)) {
    const selected = domain < 0 ? omitted : omitted.filter((item) => item.domain === domain);
    if (selected.length) return `Prioriza estos criterios pendientes:\n${bullets(selected.slice(0, 5).map((item) => `${item.label}. ${item.tip}`))}`;
    if (matchesCriterion) return `${matchesCriterion.earned ? 'Registraste' : 'Quedó pendiente'} «${matchesCriterion.label}». ${matchesCriterion.tip}`;
    if (omitted.length) return 'Hay criterios pendientes en esta estación. Pregúntame qué te faltó en general o menciona el nombre de una acción de la rúbrica.';
    return 'Registraste todos los criterios puntuados. Puedes repasar el diagnóstico esperado o consultar la referencia de esta estación.';
  }
  if (/punt|nota\b|calific/.test(intent)) {
    if (domain >= 0) return `Obtuviste ${result.domains[domain]}/${DOMAINS[domain]} en ${PHASES[domain]}. En total, ${result.score}/100.`;
    return `Obtuviste ${result.score}/100. Este es el desglose:\n${bullets(PHASES.map((phase, index) => `${phase}: ${result.domains[index]}/${DOMAINS[index]}`))}`;
  }
  if (matchesCriterion) return `${matchesCriterion.earned ? 'Registraste' : 'Quedó pendiente'} «${matchesCriterion.label}». ${matchesCriterion.tip}`;
  if (matchesObservation) return `En esta estación, la ficha del caso registró «${matchesObservation.label}». ${matchesObservation.reply}`;
  if (/resumen|escenario|de que trat|contexto/.test(intent)) {
    return scenario ? `${scenario}${opening ? '\nEl familiar dijo: «' + opening + '»' : ''}`
      : `${result.title}. El diagnóstico previsto en la rúbrica era «${result.diagnosis}».`;
  }
  return 'Con los resultados guardados puedo explicar el puntaje, las decisiones incorrectas, los criterios pendientes y el diagnóstico esperado. Prueba con el nombre de una decisión o pregúntame qué te faltó.';
}
