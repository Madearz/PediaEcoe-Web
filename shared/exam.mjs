export const EXAM_AREAS = {
  general: 'Estado general',
  vitals: 'Signos vitales',
  growth: 'Peso, talla y crecimiento',
  head: 'Cabeza, ojos, cuello y ganglios',
  ent: 'Oídos, nariz y garganta',
  respiratory: 'Respiratorio',
  cardiovascular: 'Cardiovascular y perfusión',
  abdomen: 'Abdomen e hidratación',
  neurological: 'Neurológico',
  skin: 'Piel y mucosas',
  musculoskeletal: 'Musculoesquelético',
  urinary: 'Genitourinario',
  other: 'Otros hallazgos',
};

const patterns = {
  general: /estado general|apariencia general|aspecto general|aspecto toxico|nivel de actividad|llanto|consolable/,
  vitals: /signos vitales|frecuencia (?:cardiaca|respiratoria)|presion arterial|tension arterial|temperatura|saturacion|oxigenacion|constantes|taquicardia|bradicardia/,
  growth: /antropometr|\bpeso\b|\btalla\b|crecimiento|perimetro cefalico|percentil/,
  head: /\bcabeza\b|ojo\w*\b|ocul\w*|pupila|fontanela|cuello|ganglio|adenopat|nuca|conjuntiv|esclerot|orbita/,
  respiratory: /respir|ventil|pulmon|via aerea|estridor|tiraje|sibilan|auscultacion pulmonar|ruidos respiratorios|taquipnea/,
  cardiovascular: /cardiac|cardiovasc|corazon|perfusion|pulso|soplo|llenado capilar|precordio/,
  abdomen: /abdom|hepat|esplen|hidrat|tolerancia oral|diuresis|deposicion|higado|sangrado digestivo/,
  neurological: /neurolog|conciencia|estado mental|focalidad|meninge|reflejo|tono muscular|alerta|glasgow|pupila/,
  skin: /piel|mucosa|exantema|erupcion|petequia|lesion cutanea|coloracion|dermat|placas/,
  ent: /oidos?|nariz|garganta|otoscop|timpan|orofaring|amigdal|mastoide/,
  musculoskeletal: /musculoesquelet|articul|extremidad|deambula|marcha|movilidad|deformidad/,
  urinary: /genitourinar|suprapub|vesical|genital|escrot|testicul|\bingle\b|regiones inguinales|puno percusion|flanco/,
};

export const normalizeClinicalRequest = (text) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function examAreas(label) {
  const text = normalizeClinicalRequest(label);
  const areas = Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([area]) => area);
  return areas.length ? areas : ['other'];
}

const examPrompt = /\b(examen fisico|exploracion fisica|examen de (?:todo el cuerpo|todos los sistemas)|hallazgos? (?:clinicos?|del examen|a la exploracion)|(?:a|al) (?:examen|exploracion))\b/;
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
const objectiveRequest = /\b(signos vitales|constantes vitales|spo2|sato2|saturacion|presion arterial|tension arterial|frecuencia (?:cardiaca|respiratoria)|llenado capilar|relleno capilar|otoscopia|peso y talla|examen (?:respiratorio|cardiaco|cardiovascular|neurologico|abdominal|musculoesqueletico|genitourinario))\b/;
const observedExamQuery = /\b(?:como (?:esta|estan|se ve|se ven|se palpa|se palpan)|que (?:ves|ve|encuentras|encuentra)) (?:el |la |los |las )?(?:abdomen|ganglios|reflejos|pulsos|pupilas|fontanela|mucosas|timpanos|genitales|cuello)\b/;
const directArea = /^(?:y )?(?:el |la |los |las )?(abdomen|piel|mucosas|respiratorio|cardiovascular|neurologico|musculoesqueletico|genitourinario|estado general|cabeza|ojos|cuello|ganglios|peso|talla|genitales|reflejos|auscultacion(?: pulmonar| cardiaca)?)(?: por favor)?$/;
const examinationText = (question) => normalizeClinicalRequest(question).replace(/^(?:(?:aja|bueno|a ver|entonces|ok|listo) )+/, '');

export function requestedExam(interactions, question) {
  const text = examinationText(question);
  const explicit = examPrompt.test(text) || examAction.test(text) || objectiveRequest.test(text) || directArea.test(text) || observedExamQuery.test(text);
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

const sections = {
  general: [
    [/alerta|somnolen|aspecto|llora|consol|actividad|estado general/, /letarg|fatiga|choque|tox|somnolen|confusion|inestab|convuls|conciencia|grave|deterior/,
      'Vigil y reactivo a la interacción durante la evaluación.', 'Nivel de actividad y respuesta al contacto por valorar en esta evaluación.'],
  ],
  growth: [
    [/\bpeso\b|\btalla\b|percentil|crecimiento|antropometr/, /desnutri|crecimiento|peso|prematur|lactancia|ganancia ponderal/,
      'Registrar peso y talla en la curva correspondiente. La estación no consigna cifras adicionales.', 'Revisar las mediciones y la tendencia en la curva de crecimiento.'],
  ],
  head: [
    [/ojo|ocul|pupil|conjuntiv|escler|periorbit|palpebr/, /ocular|periorbit|icter|conjuntiv|vision|cefalea|palidez|uveit|orbita|trauma/,
      'Ojos simétricos, sin edema palpebral visible.', 'Examen dirigido de ojos y región periocular pendiente de precisar.'],
    [/cuello|nuca|rigidez|ganglio|adenopat|fontanela|cabeza/, /cuello|nuca|mening|ganglio|adenopat|fontanela|trauma|rigidez|exantema|cefalea/,
      'Cuello móvil y sin aumento de volumen visible.', 'Movilidad del cuello y palpación de ganglios por precisar.'],
  ],
  ent: [
    [/otoscop|timpan|oido|otorr|pabellon/, /otit|otalgia|oido|otorrea|audicion|mastoide|timpan/,
      'Otoscopia: membranas timpánicas sin abombamiento.', 'Los detalles de la otoscopia requieren evaluación dirigida.'],
    [/faring|nariz|nasal|amigd|garganta|trismo|deglut|babeo|secreciones/, /via aerea|faring|amigda|estridor|trismo|babeo|caustic|ingestion|secrecion|nasal|congestion/,
      'Nariz y orofaringe sin secreciones abundantes ni exudado visible.', 'La inspección de nariz y orofaringe se ajusta al cuadro y a la seguridad de la vía aérea.'],
  ],
  respiratory: [
    [/tiraje|esfuerzo respir|respiracion|trabajo respir|expansion|taquipnea|apnea|estridor|ventila/, /respir|pulmon|asma|bronqui|estridor|disnea|satura|apnea|choque|tos\b|cianosis/,
      'Expansión torácica simétrica y sin tiraje.', 'Trabajo respiratorio y simetría ventilatoria por precisar a la inspección.'],
    [/auscult|sibilan|estertor|crepitan|ruidos respir|murmullo|entrada de aire/, /asma|neumon|tos\b|bronqui|pulmon|aspiracion|respirator|disnea|cuerpo extrano/,
      'Murmullo vesicular bilateral sin ruidos agregados.', 'La auscultación pulmonar requiere un hallazgo específico del caso.'],
  ],
  cardiovascular: [
    [/soplo|ruidos cardi|ritmo|roce|arritmia|auscultacion cardi/, /soplo|cardiac|miocard|taquicardia|arritmia|cardiopat|choque|neonato/,
      'Ruidos cardíacos rítmicos sin soplo evidente.', 'Ritmo y auscultación cardíaca por precisar.'],
    [/pulso|perfund|perfusion|llenado|relleno|frialdad|extremidades tibias/, /perfusion|choque|shock|cardiac|hipovolem|frialdad|deshidrat|sepsis|sangrado/,
      'Pulsos periféricos palpables y llenado capilar de 2 segundos.', 'Pulsos periféricos, temperatura distal y llenado capilar por verificar.'],
  ],
  abdomen: [
    [/abdom|defensa|distens|hepatomeg|esplenomeg|globo vesical|dolor focal/, /abdom|hepat|icteri|vomit|diarrea|intestinal|vesical|inva[gj]in|hernia|escrot/,
      'Abdomen blando, sin defensa a la palpación.', 'Palpación abdominal dirigida a dolor, distensión y signos de irritación.'],
    [/hidrat|mucosa|diuresis|boca seca|lagrim|turgor/, /deshidrat|hipovolem|diarrea|vomit|choque|oliguria|ingesta minima|sed/,
      'Mucosas húmedas.', 'Completar valoración de mucosas, lágrimas y diuresis.'],
  ],
  neurological: [
    [/alerta|conciencia|somnolen|estado mental|respuesta|glasgow|orientad/, /convuls|neuro|mening|somnolen|conciencia|letarg|confus|hipoglu|intoxic|cefalea|trauma/,
      'Alerta, con respuesta apropiada al contacto.', 'Estado de conciencia y respuesta motora por precisar.'],
    [/focal|reflej|fuerza|movilidad simetrica|mueve |marcha|deficit|debilidad|tono/, /convuls|neuro|mening|debilidad|paresia|trauma|focal|desarroll|somnolen/,
      'Movimientos espontáneos simétricos.', 'Exploración dirigida de fuerza, simetría y reflejos según la colaboración.'],
  ],
  skin: [
    [/piel|exantema|petequi|ampolla|lesion|herida|costra|equimos|quemadura|excor/, /piel|erupcion|exantema|petequi|prurito|urtic|dermat|herid|quemad|escabi|ampolla|equimos|maltrat/,
      'Piel íntegra, sin lesiones visibles en la inspección general.', 'Inspección dirigida de la distribución y características de las lesiones.'],
    [/palidez|coloracion|cianosis|icter|mucosa|turgor/, /palidez|anemia|icteri|choque|cianosi|deshidrat|sangrado/,
      'Coloración cutánea y de mucosas conservada a la inspección.', 'Coloración y mucosas por precisar.'],
  ],
  musculoskeletal: [
    [/articul|extremidad|movimient|movilidad|marcha|fuerza|deformidad|fractura|tumefaccion/, /articul|artrit|miembro|marcha|cojera|fractura|trauma|deformidad|debilidad|cadera|quemad/,
      'Movilidad espontánea simétrica, sin aumento de volumen articular visible.', 'Valorar sensibilidad, movilidad y deformidad en la región afectada.'],
  ],
  urinary: [
    [/suprapub|vesical|genital|escrot|testicul|inguinal|punopercusion/, /urinari|renal|diuresis|vesical|flanco|genital|escrot|testicul|inguinal|maltrat|abuso|oliguria/,
      'Sin distensión suprapúbica visible. El examen genital se realiza solo cuando esté indicado.', 'Hallazgos suprapúbicos y genitourinarios por valorar según la indicación del caso.'],
  ],
};

export function ageInMonths(data) {
  const text = normalizeClinicalRequest(data.scenario);
  const age = text.match(/\b(\d+) (anos?|mes(?:es)?|semanas?|dias?)\b/);
  if (!age) return /recien nacido|neonato|prematuro/.test(text) ? 0 : null;
  const [, value, unit] = age;
  return Number(value) * (unit.startsWith('ano') ? 12 : unit.startsWith('mes') ? 1 : unit.startsWith('semana') ? 7 / 30 : 1 / 30);
}

// Representative fictional values within the broad paediatric observation bands in the RCH guideline.
// https://www.rch.org.au/clinicalguide/guideline_index/Normal_Ranges_for_Physiological_Variables/
function ageVitals(months) {
  if (months === null) return null;
  if (months < 3) return [140, 40, '75/44'];
  if (months < 12) return [128, 34, '87/54'];
  if (months < 24) return [114, 30, '91/57'];
  if (months < 60) return [105, 25, '95/60'];
  if (months < 120) return [92, 22, '102/63'];
  if (months < 144) return [86, 19, '108/65'];
  return [80, 18, '112/68'];
}

function vitalFields(data) {
  const baseline = ageVitals(ageInMonths(data));
  return [
    [/frecuencia cardiaca|taquicardia|bradicardia|\bfc \d|\b\d+ (?:lpm|latidos)/, /taquicard|bradicard|choque|hipovolem|sepsis|arritmia|hemorrag|palpit|deshidrat/,
      baseline ? `FC ${baseline[0]}/min.` : '', 'Frecuencia cardíaca numérica por verificar.'],
    [/frecuencia respiratoria|taquipnea|bradipnea|\bfr \d|\b\d+ (?:rpm|respiraciones)/, /dificultad respir|taquipne|bradipne|asma|bronqui|crup|apnea|estridor|fatiga respir|choque|hiperventil|acidosis/,
      baseline ? `FR ${baseline[1]}/min.` : '', 'Frecuencia respiratoria numérica por verificar.'],
    [/presion arterial|tension arterial|hipertension|hipotension|presion (?:muy )?elevada|\bpa \d|\b\d+\s+\d+ mmhg/, /hipertension|presion (?:muy )?elevada|choque|hipovolem|sepsis|hemorrag|hipotens|hipoperfusion|deterioro circulatorio/,
      baseline ? `PA ${baseline[2]} mmHg.` : '', 'Presión arterial numérica por verificar.'],
    [/temperatura|fiebre|febril|afebril|hipoterm|\b\d{2}(?: \d)? c\b/, /fiebre|febril|hipoterm|sepsis|perdida de calor/,
      'Temperatura 36,8 °C.', 'Temperatura actual por verificar.'],
    [/saturacion|oxigenacion|desaturacion|\bspo ?2\b|\bsato2\b/, /dificultad respir|asma|bronqui|apnea|neumon|cianosis|desatur|hipox|inhalacion|choque/,
      'SpO₂ 98 % al aire ambiente.', 'SpO₂ numérica por verificar.'],
  ];
}

function physicalFindings(data) {
  return data.interactions.filter(({ group, reply }) => group === 'exploracion' && reply);
}

export function systemExam(data, area, requested = []) {
  const interactions = physicalFindings(data);
  const recorded = interactions.filter((item) => examAreas(item.label + ' ' + item.reply).includes(area)
    && (!requested.length || requested.some((pattern) => pattern.test(normalizeClinicalRequest(item.label + ' ' + item.reply)))));
  if (area === 'other') return { recorded, reply: recorded.length ? '' : 'La estación no consigna otros hallazgos además de los sistemas listados.' };
  const context = normalizeClinicalRequest([data.title, data.scenario, data.opening,
    ...data.interactions.filter(({ group }) => group === 'anamnesis' || group === 'exploracion').map(({ reply }) => reply)].join(' '));
  const details = recorded.map(({ reply }) => normalizeClinicalRequest(reply));
  const fields = area === 'vitals' ? vitalFields(data) : sections[area] ?? [];
  const reply = fields.filter(([finding]) => !requested.length || requested.some((pattern) => pattern.test(finding.source)))
    .filter(([finding]) => !details.some((evidence) => finding.test(evidence)))
    .map(([, concern, example, missing]) => example && !concern.test(context) ? example : missing).join(' ');
  return { recorded, reply };
}

export function completeExam(data, areas = Object.keys(EXAM_AREAS)) {
  const sections = areas.map((area) => ({ area, ...systemExam(data, area) }));
  return assembleExam(sections);
}

function assembleExam(sections) {
  return {
    recorded: [...new Map(sections.flatMap(({ recorded }) => recorded).map((item) => [item.id, item])).values()],
    supplemental: sections.filter(({ reply }) => reply).map(({ area, reply }) => ({
      id: 'system:' + area, label: EXAM_AREAS[area], reply, kind: 'simulated',
    })),
  };
}

export function examRequest(data, question) {
  const recorded = requestedExam(data.interactions, question);
  if (!recorded) return null;
  const text = examinationText(question);
  let areas = examAreas(text).filter((area) => area !== 'other');
  if (/\b(?:examen fisico completo|exploracion fisica completa|examen de (?:todo el cuerpo|todos los sistemas))\b/.test(text)
    || (!areas.length && examPrompt.test(text))) return { ...completeExam(data), complete: true };
  if (!areas.length && /\bauscult\w*\b/.test(text)) areas = ['respiratory', 'cardiovascular'];
  const exact = specificFindings.filter((pattern) => pattern.test(text));
  const sectionResults = areas.map((area) => ({ area, ...systemExam(data, area, area === 'vitals' ? exact : []) }));
  const result = assembleExam(sectionResults);
  return { recorded, supplemental: result.supplemental, complete: false };
}
