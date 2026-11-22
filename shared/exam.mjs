export const EXAM_AREAS = {
  vitals: 'Signos vitales',
  respiratory: 'Respiratorio',
  cardiovascular: 'Cardiovascular y perfusión',
  abdomen: 'Abdomen e hidratación',
  neurological: 'Neurológico',
  skin: 'Piel y mucosas',
  other: 'Otros hallazgos',
};

const patterns = {
  vitals: /signos vitales|frecuencia|presion arterial|temperatura|saturacion|oxigenacion|constantes|antropometria/,
  respiratory: /respir|ventil|pulmon|via aerea|estridor|tiraje|sibilan|auscultacion pulmonar|ruidos respiratorios|taquipnea/,
  cardiovascular: /cardiac|cardiovasc|corazon|perfusion|pulso|soplo|llenado capilar|precordio/,
  abdomen: /abdom|hepat|esplen|hidrat|tolerancia oral|diuresis|deposicion|higado|sangrado digestivo/,
  neurological: /neurolog|conciencia|estado mental|focalidad|meninge|reflejo|tono muscular|alerta|glasgow|pupila/,
  skin: /piel|mucosa|exantema|erupcion|petequia|lesion cutanea|coloracion|dermat|placas/,
};

export const normalizeClinicalRequest = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function examAreas(label) {
  const text = normalizeClinicalRequest(label);
  const areas = Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([area]) => area);
  return areas.length ? areas : ['other'];
}

const examPrompt = /\b(examen fisico|exploracion fisica|hallazgos? (?:clinicos?|del examen|a la exploracion)|(?:a|al) (?:examen|exploracion))\b/;
const examAction = /\b(auscult\w*|palp\w*|inspeccion\w*|examino|examinar|examinarlo|exploro|explorar|explorarlo|mido|tomo (?:la|el|los|las)|valoro|eval[uú]o|percuto|otoscopia)\b/;
const permission = /\b(puedo|podria|me permite|esta bien si|le parece si)\b/;
const wantsResult = /\b(que (?:encuentro|veo|escucho|oigo|se (?:oye|escucha|observa)|hallazgos?)|cual(?:es)? (?:es|son)|resultado)\b/;
const specificFindings = [
  /\b(saturacion|oxigenacion|desaturacion|spo2|sato2)\b/,
  /\b(temperatura|pirexia|hipotermia)\b/,
  /\b(presion arterial|tension arterial|hipotension|hipertension)\b/,
  /\b(frecuencia cardiaca|taquicardia|bradicardia)\b/,
  /\b(frecuencia respiratoria|taquipnea|bradipnea)\b/,
  /\b(llenado capilar|relleno capilar|reperfus\w*)\b/,
  /\b(otoscopia|membrana timpanica|timpano)\b/,
];
const objectiveRequest = /\b(signos vitales|constantes vitales|spo2|sato2|saturacion|presion arterial|tension arterial|frecuencia (?:cardiaca|respiratoria)|llenado capilar|relleno capilar|otoscopia)\b/;
const directArea = /^(?:y )?(?:el |la |los )?(abdomen|piel|respiratorio|examen (?:respiratorio|neurologico|abdominal)|auscultacion(?: pulmonar| cardiaca)?)(?: por favor)?$/;

export function requestedExam(interactions, question) {
  const text = normalizeClinicalRequest(question);
  const explicit = examPrompt.test(text) || examAction.test(text) || objectiveRequest.test(text) || directArea.test(text);
  if (!explicit || (permission.test(text) && !wantsResult.test(text) && !/\b(me (?:da|dice|muestra|indica)|darme|decirme|mostrarme|indicarme)\b/.test(text))) {
    return null;
  }
  const exams = interactions.filter((item) => item.group === 'exploracion' && item.reply);
  const exact = specificFindings.filter((pattern) => pattern.test(text));
  if (exact.length) return exams.filter((item) => exact.some((pattern) => pattern.test(normalizeClinicalRequest(item.label + ' ' + item.reply))));

  const areas = examAreas(text).filter((area) => area !== 'other');
  if (/\bauscult\w*\b/.test(text) && !areas.length) {
    return exams.filter((item) => /\b(auscult\w*|ruidos respiratorios|murmullo vesicular|sibilan\w*|estertores|soplo)\b/.test(normalizeClinicalRequest(item.label + ' ' + item.reply)));
  }
  if (areas.length) {
    return exams.filter((item) => examAreas(item.label + ' ' + item.reply).some((area) => areas.some((requested) => requested === area)));
  }
  return examPrompt.test(text) || /\b(examino|exploro|examinarlo|explorarlo)\b/.test(text) ? exams : [];
}
