import { normalizeClinicalRequest } from './exam.mjs';
import { measuredExample } from './study-measurements.mjs';

const renal = /renal|nefro|diuresis|urinari|orina|hematuria|oliguria|enuresis|deshidrat|edema/;
const metabolic = /diabetes|gluc|metabol|cetona|deshidrat|somnolen|ayuno|convulsion|conciencia|intoxic|neonat|recien nacido/;
const chest = /respirat|pulmon|neumon|sibilan|asma|tos\b|estridor|saturacion|taquipnea|torax|cardiac|cardiovasc|corazon/;
const fever = /fiebre|febril|infect|sepsis|inflama|exantema|dengue|malaria/;
const electrolytes = /electrol|sodio|potasio|diur[ée]tic|arritmia|vomit|diarre|metabol|deshidrat|neonat|recien nacido/;
const anemia = /anemia|ferropeni|microcitos|hematolog|hemoglobin|palidez|sangrad|hemorrag|fatiga|falciform/;
const digestive = /abdom|hepat|ascitis|vomit|diarre|diges|apendic|masa|trauma/;
const neurological = /neuro|cefalea|convulsion|focalidad|trauma|encefal|conciencia|cefalo|mening/;

const studies = [
  { id: 'hemograma', label: 'Hemograma', aliases: /(?:hemograma|cuadro hematico|biometria hematica|conteo sanguineo)/,
    related: [fever, anemia, /petequia|purpura|neumon/],
    normal: 'Hemoglobina 12,5 g/dL; leucocitos 8.000/µL; plaquetas 250.000/µL.' },
  { id: 'hemoglobina', label: 'Hemoglobina', aliases: /(?:hemoglobina|hb)/,
    related: [anemia], normal: 'Hemoglobina 12,5 g/dL.' },
  { id: 'vcm', label: 'Volumen corpuscular medio', aliases: /(?:volumen corpuscular medio|vcm)/,
    related: [anemia], normal: 'VCM 82 fL.' },
  { id: 'ferritina', label: 'Ferritina', aliases: /(?:ferritina|perfil de hierro)/,
    related: [anemia, fever], normal: 'Ferritina 35 ng/mL.' },
  { id: 'hematocrito', label: 'Hematocrito', aliases: /(?:hematocrito|hto)/,
    related: [anemia, /dengue|choque|deshidrat/], normal: 'Hematocrito 37 %.' },
  { id: 'plaquetas', label: 'Plaquetas', aliases: /(?:plaquetas|recuento plaquetario)/,
    related: [anemia, fever, /petequia|purpura|coagul|trombocit/], normal: 'Plaquetas 250.000/µL.' },
  { id: 'reticulocitos', label: 'Reticulocitos', aliases: /reticulocitos/,
    related: [anemia, /aplas|hemoli/], normal: 'Reticulocitos 1,2 %.' },
  { id: 'glucosa', label: 'Glucosa', aliases: /(?:glucemia|glicemia|glucometria|glucosa)/,
    related: [metabolic], normal: 'Glucosa 90 mg/dL.' },
  { id: 'cetonas', label: 'Cetonas', aliases: /(?:cetonas|cetonemia|cetonuria|cuerpos cetonicos)/,
    related: [metabolic], normal: 'Cetonas 0,2 mmol/L.' },
  { id: 'sodio', label: 'Sodio', aliases: /sodio/, related: [renal, electrolytes], normal: 'Sodio 140 mmol/L.' },
  { id: 'potasio', label: 'Potasio', aliases: /potasio/, related: [renal, electrolytes], normal: 'Potasio 4,2 mmol/L.' },
  { id: 'electrolitos', label: 'Electrolitos', aliases: /(?:electrolitos|ionograma)/, related: [renal, electrolytes],
    normal: 'Sodio 140 mmol/L y potasio 4,2 mmol/L.' },
  { id: 'creatinina', label: 'Creatinina', aliases: /(?:creatinina|perfil renal|funcion renal)/, related: [renal, /choque|hipertension|intoxic/],
    normal: null },
  { id: 'hepatica', label: 'Perfil hepático', aliases: /(?:perfil hepatico|funcion hepatica|transaminasas|ast y alt|pruebas hepaticas)/,
    related: [/hepat|icter|bilirrub|paracetamol|intoxic|choque|neonat|recien nacido/],
    normal: null },
  { id: 'bilirrubina', label: 'Bilirrubina', aliases: /(?:bilirrubina(?: total| directa| indirecta| fraccionada)?)/,
    related: [/hepat|icter|bilirrub|hemoli|neonat|recien nacido/], normal: 'Bilirrubina total 0,6 mg/dL.' },
  { id: 'albumina', label: 'Albúmina', aliases: /albumina/, related: [renal, /hepat|albumin|desnutri/],
    normal: 'Albúmina 4,1 g/dL.' },
  { id: 'coagulacion', label: 'Pruebas de coagulación', aliases: /(?:(?:pruebas? de |perfil de )?coagulacion|coagulograma|inr)/,
    related: [/sangrad|hemorrag|coagul|petequia|purpura|hepat|sepsis|trauma/],
    normal: 'Tiempo de protrombina 12,5 s; TTPa 30 s.' },
  { id: 'gasometria', label: 'Gasometría', aliases: /(?:gasometria(?: arterial| venosa)?|gases (?:arteriales|venosos))/,
    related: [chest, metabolic, /choque|acidosis|hipoperfusion/],
    normal: null },
  { id: 'orina', label: 'Análisis de orina', aliases: /(?:uroanalisis|parcial de orina|analisis de orina|examen de orina|examen general de orina|tira de orina)/,
    related: [renal, fever, metabolic], normal: 'Tira reactiva sin sangre, proteínas, nitritos ni esterasa leucocitaria.' },
  { id: 'urocultivo', label: 'Urocultivo', aliases: /(?:urocultivo|cultivo de orina)/,
    related: [renal, fever], normal: 'Sin crecimiento bacteriano significativo.' },
  { id: 'complemento', label: 'Complemento C3', aliases: /(?:complemento(?: c3)?|c3)/,
    related: [renal, /lupus|inmun|complemento/], normal: 'Complemento C3 105 mg/dL.' },
  { id: 'heces', label: 'Estudio de heces', aliases: /(?:coproparasitari[oa]|coproscopico|coprologico|(?:estudio|prueba|analisis) de heces|examen de heces)/,
    related: [digestive, /parasito|heces|giardia|ameb|uncinaria/], normal: 'Sin huevos, quistes ni parásitos en la muestra simulada.' },
  { id: 'pcr', label: 'Proteína C reactiva', aliases: /(?:proteina c reactiva|pcr cuantitativa|pcr inflamatoria)/,
    related: [fever, chest, /artritis|apendic|inflam|vasculit/], normal: 'Proteína C reactiva 2 mg/L.' },
  { id: 'ecg', label: 'Electrocardiograma', aliases: /(?:ecg|ekg|electrocardiograma)/,
    related: [chest, electrolytes, /sincop|arritmia|palpitacion|taquicardia|choque|dolor torac|intoxic/],
    normal: 'Ritmo sinusal.' },
  { id: 'rx-torax', label: 'Radiografía de tórax', aliases: /(?:(?:radiografia|rx|placa) (?:de |del )?torax)/,
    related: [chest, /trauma|cuerpo extrano|aspiracion/], normal: 'Sin consolidación focal, derrame pleural ni neumotórax.' },
  { id: 'rx-abdomen', label: 'Radiografía de abdomen', aliases: /(?:(?:radiografia|rx|placa) (?:de |del )?abdomen|radiografia abdominal)/,
    related: [digestive], normal: 'Sin dilatación intestinal ni aire libre en el informe simulado.' },
  { id: 'eco-abdomen', label: 'Ecografía abdominal', aliases: /(?:(?:eco|ecografia|ultrasonido) (?:de |del )?abdomen|ecografia abdominal|ultrasonido abdominal)/,
    related: [renal, digestive],
    normal: 'Sin líquido libre ni colecciones en el informe simulado.' },
  { id: 'eco-renal', label: 'Ecografía renal', aliases: /(?:ecografia renal|ultrasonido renal|(?:eco|ecografia|ultrasonido) de rinones)/,
    related: [renal, /masa|dilatacion del sistema colector/], normal: 'Riñones sin dilatación del sistema colector en el informe simulado.' },
  { id: 'ecografia', label: 'Ecografía', aliases: /(?:ecografia|ultrasonido)/, related: [], normal: null },
  { id: 'radiografia', label: 'Radiografía', aliases: /(?:radiografia|rx)/, related: [], normal: null },
  { id: 'lcr', label: 'Análisis de líquido cefalorraquídeo', aliases: /(?:(?:analisis de )?liquido cefalorraquideo|lcr)/,
    related: [neurological, fever], normal: null },
  { id: 'neuroimagen', label: 'Neuroimagen', aliases: /(?:neuroimagen|tomografia craneal|tac craneal|tomografia de craneo|resonancia cerebral)/,
    related: [neurological], normal: null },
];

const studyRequest = /\b(solicit\w*|pedir|pido|ordeno|ordenar|quisiera|quiero|dame|muestr\w*|resultados?|paraclinic[oa]s?|realiz\w*|me (?:da|dice|indica)|tom\w*|mido|hacer|como (?:esta|salio)|cual (?:es|fue)|cuales (?:son|fueron)|cuanto (?:tiene|mide|dio|salio|es|esta)|cuanta hemoglobina|(?:nivel|valor) de|esta (?:baj[oa]|alt[oa]|normal))\b/;

// Datos ficticios de esta estación. El caso original registra microcitosis persistente.
const ironFollowUp = {
  hemograma: 'Hemoglobina 9,6 g/dL; VCM 68 fL.',
  hemoglobina: 'Hemoglobina 9,6 g/dL.',
  vcm: 'VCM 68 fL.',
  ferritina: 'Ferritina 8 ng/mL.',
};

const numericStudies = new Set(['hemograma', 'hemoglobina', 'vcm', 'ferritina', 'hematocrito', 'plaquetas', 'reticulocitos',
  'glucosa', 'cetonas', 'sodio', 'potasio', 'electrolitos', 'creatinina', 'hepatica', 'bilirrubina', 'albumina',
  'coagulacion', 'gasometria', 'complemento', 'pcr']);
const earlyAgeStudies = new Set(['hemograma', 'hemoglobina', 'vcm', 'hematocrito', 'reticulocitos', 'ferritina']);
const unitValue = /[+-]?\d[\d.,]*\s*(?:[a-zµμ]+\s*\/\s*[a-zµμ]+|\/\s*[a-zµμ]+|%|fL\b|pg\b|s\b)/gi;
const analyte = /\b(?:hemoglobina|hematocrito|plaquetas|leucocitos|eosin[oó]filos|reticulocitos|ferritina|volumen corpuscular medio|vcm|glucosa|glucemia|cetonas|sodio|potasio|creatinina|bilirrubina(?: total| directa| indirecta)?|albúmina|albumina|tiempo de protrombina|ttpa|complemento c3|proteína c reactiva|proteina c reactiva|bicarbonato|alt|ast)\b/gi;
export const MISSING_STUDY_VALUE = 'Valor numérico no registrado.';

function rawStudyMeasurements(reply) {
  let start = 0;
  const labelled = Array.from(reply.matchAll(unitValue), (match) => {
    const label = Array.from(reply.slice(start, match.index).matchAll(analyte)).at(-1)?.[0];
    start = match.index + match[0].length;
    return label ? label + ' ' + match[0] : match[0];
  });
  if (labelled.length) return labelled.join('; ') + '.';
  return /^\s*(?:(?:pH|INR)\s*)?[+-]?\d+(?:[.,]\d+)?\s*\.?\s*$/i.test(reply) ? reply.trim() : '';
}

function exampleValue(study, context) {
  if (study.related.some((pattern) => pattern.test(context))) return null;
  if (earlyAgeStudies.has(study.id) && /neonat|recien nacido|\b(?:\d+ (?:dias?|semanas?)|[1-5] meses?)\b/.test(context)) return null;
  return study.normal;
}

function numericLabel(label) {
  return studies.some((study) => numericStudies.has(study.id) && matchesStudy(study, normalizeClinicalRequest(label)));
}

export function formatStudyResult(result) {
  const value = result.value.trim();
  const unit = result.unit.trim();
  if (unit && /^[+-]?\d[\d.,]*$/.test(value)) return `${value} ${unit}`;
  if (numericLabel(result.label)) return rawStudyMeasurements(value) || MISSING_STUDY_VALUE;
  return [value, unit].filter(Boolean).join(' ');
}

export function displayStoredStudy(data, item) {
  if (item.group !== 'paraclinicos') return item;
  const edited = data.studyResults?.find((result) => result.id === item.id);
  if (edited) return { ...item, label: edited.label, reply: formatStudyResult(edited) };
  return numericLabel(item.label) ? { ...item, reply: rawStudyMeasurements(item.reply) || MISSING_STUDY_VALUE } : item;
}

const reportTerms = {
  hemograma: /hemoglobin|microcitos|macrocitos|hemato[cq]rito|leucocit|eosinofil|plaquetas|trombocit|anemia/,
  hemoglobina: /anemia microcitica|anemia macrocitica/,
  vcm: /microcitos|macrocitos/,
  plaquetas: /trombocitopenia|trombocitosis/,
  glucosa: /hipoglucemia|hiperglucemia|hipoglicemia|hiperglicemia/,
  cetonas: /cetonemia|cetonuria|cetosis/,
  sodio: /hiponatremia|hipernatremia/,
  potasio: /hipopotasemia|hiperpotasemia|hipokalemia|hiperkalemia/,
  electrolitos: /hiponatremia|hipernatremia|hipopotasemia|hiperpotasemia|\b(?:sodio|potasio)\b/,
  creatinina: /filtrado (?:renal|glomerular)|creatinina/,
  hepatica: /patron hepatocelular|estudios hepaticos/,
  coagulacion: /coagulacion alterada|coagulopatia/,
  orina: /proteinuria|hematuria glomerular|sedimento urinario/,
  ecg: /ondas? [tu]\b|qrs|(?:ritmo|taquicardia) (?:regular )?de complejo estrecho/,
  'eco-renal': /ecografi\w*[^.;]*\borigen renal\b|\borigen renal\b[^.;]*ecografi\w*/,
  'eco-abdomen': /patron ecografico en diana|ecografi\w*[^.;]*lesion hepatica|lesion hepatica[^.;]*ecografi\w*/,
  heces: /huevos? compatibles|huevos? con tapones|antigeno de giardia|proglotides|prueba especifica compatible/,
  lcr: /pleocitosis/,
};

function stationStudyResults(data, caseId) {
  return caseId === 'practica100-ferropenia-sin-respuesta'
    || normalizeClinicalRequest(data.title) === 'anemia sin mejoria durante un tratamiento indicado' ? ironFollowUp : {};
}

function matchesStudy(study, text) {
  return new RegExp(`\\b${study.aliases.source}\\b`).test(text);
}

function studyContext(data, interactions = data.interactions) {
  return normalizeClinicalRequest([data.title, data.category, data.scenario, data.opening,
    ...interactions.map((item) => item.label + ' ' + item.reply)].join(' '));
}

function examReport(study, data) {
  for (const item of data.interactions) {
    if (item.group !== 'exploracion' || !item.reply) continue;
    const label = normalizeClinicalRequest(item.label);
    const reply = normalizeClinicalRequest(item.reply);
    if (study.id === 'glucosa' && /\blcr\b|liquido cefalorraquideo/.test(label)
      && !/glucemia|glucosa (?:en sangre|plasmatica)/.test(reply)) continue;
    const clauses = item.reply.split(/;\s*|(?<=[.!?])\s+/);
    const matches = clauses.filter((clause) => {
      const text = normalizeClinicalRequest(clause);
      return matchesStudy(study, text) || reportTerms[study.id]?.test(text);
    });
    if (matches.length) return matches.join('; ');
  }
}

export function isStudyListRequest(question) {
  const text = normalizeClinicalRequest(question);
  return /\b(?:que|cuales) (?:son )?(?:los )?(?:paraclinicos|estudios|examenes de laboratorio) (?:hay|estan disponibles|tienen disponibles|puedo (?:solicitar|pedir|consultar))\b/.test(text)
    || /\b(?:lista|catalogo) de (?:los )?(?:paraclinicos|estudios)\b/.test(text);
}

export function studySuggestions(data, caseId) {
  const results = stationStudyResults(data, caseId);
  const clinicalContext = studyContext(data, data.interactions.filter((item) => !['razonamiento', 'acciones', 'cierre'].includes(item.group)));
  const fullContext = studyContext(data);
  const existing = data.interactions.filter((item) => item.group === 'paraclinicos');
  const edited = (data.studyResults ?? []).filter((item) => !existing.some((entry) => entry.id === item.id));
  const stored = [...existing.map((item) => displayStoredStudy(data, item)), ...edited];
  const available = studies.filter((item) => !stored.some((entry) => matchesStudy(item, normalizeClinicalRequest(entry.label))));
  const curated = available.filter((item) => Object.hasOwn(results, item.id));
  const reported = curated.length ? curated.filter((item) => item.id !== 'vcm')
    : available.filter((item) => {
      if (['hemoglobina', 'vcm'].includes(item.id)) return false;
      const reply = examReport(item, data);
      return reply && (!numericStudies.has(item.id) || rawStudyMeasurements(reply));
    });
  const quantified = available.filter((item) => !['hemoglobina', 'vcm'].includes(item.id)
    && measuredExample(item.id, examReport(item, data), fullContext));
  const related = available.filter((item) => item.related.some((pattern) => pattern.test(clinicalContext)));
  const examples = reported.length || quantified.length || existing.length || edited.length ? [] : available.filter((item) => exampleValue(item, fullContext)).slice(0, 1);
  const suggestions = [...new Set([...reported, ...quantified, ...related.slice(0, examples.length ? 2 : 3), ...examples, ...related])]
    .slice(0, 3).map(({ id, label }) => ({ id, label, documented: reported.some((item) => item.id === id) }));
  return [...edited.map(({ id, label }) => ({ id: 'edited:' + id, label, documented: true })), ...suggestions];
}

export function stationStudySamples(data, caseId) {
  const results = stationStudyResults(data, caseId);
  return studies.flatMap((study) => {
    const value = results[study.id] ?? examReport(study, data);
    return value ? [{ id: 'sample-' + study.id, label: study.label, value, unit: '', reference: '' }] : [];
  });
}

export function availableStudyOptions(data, caseId) {
  const existing = data.interactions.filter((item) => item.group === 'paraclinicos');
  const edited = data.studyResults ?? [];
  const stored = [...existing.map((item) => displayStoredStudy(data, item)),
    ...edited.filter((item) => !existing.some(({ id }) => id === item.id)).map((item) => ({ ...item, reply: formatStudyResult(item) }))];
  const seen = new Set(stored.map(({ label }) => normalizeClinicalRequest(label)));
  const options = stored.filter(({ reply }) => reply && reply !== MISSING_STUDY_VALUE)
    .map(({ id, label }) => ({ id: 'stored:' + id, label, kind: 'case' }));
  for (const study of studies) {
    if ([...seen].some((label) => matchesStudy(study, label))) continue;
    const result = requestedStudies(data, study.label, caseId)?.supplemental.find(({ id }) => id === study.id);
    if (result && result.kind !== 'unavailable') options.push({ id: study.id, label: study.label, kind: result.kind });
  }
  return options.sort((first, second) => Number(second.kind === 'case') - Number(first.kind === 'case'));
}

export function requestedStudies(data, question, caseId) {
  const text = normalizeClinicalRequest(question);
  const matched = studies.filter((study) => matchesStudy(study, text));
  const requested = matched.filter((study) =>
    !(study.id === 'ecografia' && matched.some((item) => item.id.startsWith('eco-')))
    && !(study.id === 'radiografia' && matched.some((item) => item.id.startsWith('rx-'))));
  const explicit = studyRequest.test(text);
  const generic = /\bparaclinic[oa]s?\b/.test(text);
  const edited = (data.studyResults ?? []).filter((item) => {
    const label = normalizeClinicalRequest(item.label);
    return text === label || (explicit && (
      (generic && !requested.length && /^(?:solicito |pido |dame )?(?:los )?paraclinicos?$/.test(text))
      || (' ' + text + ' ').includes(' ' + label + ' ')
      || requested.some((study) => matchesStudy(study, label))));
  });
  const documented = data.interactions.filter((item) => {
    if (item.group !== 'paraclinicos') return false;
    if (edited.some((entry) => entry.id === item.id)) return true;
    if (!item.reply) return false;
    const name = normalizeClinicalRequest(item.label);
    if (text === name || (explicit && (` ${text} `).includes(` ${name} `)) || (generic && !requested.length)) return true;
    const label = normalizeClinicalRequest(item.label + ' ' + item.reply);
    return requested.some((study) => matchesStudy(study, label)
      && !edited.some((entry) => matchesStudy(study, normalizeClinicalRequest(entry.label))));
  });
  const remainder = requested.reduce((current, study) =>
    current.replace(new RegExp(`\\b${study.aliases.source}\\b`, 'g'), ' '), text);
  const bare = requested.length > 0 && /^(?:(?:y|o|el|la|los|las|un|una|por favor)\b\s*|\s+)*$/.test(remainder);
  if (!explicit && !bare && !edited.length && !documented.some((item) => text === normalizeClinicalRequest(item.label))) return null;
  if (!requested.length && !documented.length && !edited.length && !generic
      && !/\b(hemocultivos?|cultivos?|radiografias?|ecografias?|tomografias?|resonancia|prueba de laboratorio)\b/.test(text)) return null;

  const stored = [...documented.map((item) => item.label + ' ' + item.reply), ...edited.map((item) => item.label)].map(normalizeClinicalRequest);
  const context = studyContext(data);
  const results = stationStudyResults(data, caseId);
  const supplemental = edited.filter((item) => !documented.some(({ id }) => item.id === id)).map((item) => {
    const reply = formatStudyResult(item);
    return { id: 'edited:' + item.id, label: item.label, reply, kind: reply === MISSING_STUDY_VALUE ? 'unavailable' : 'case' };
  });
  for (const study of requested) {
    if (stored.some((label) => matchesStudy(study, label))) continue;
    const caseResult = results[study.id] ?? examReport(study, data);
    const numeric = numericStudies.has(study.id);
    const report = numeric && caseResult ? rawStudyMeasurements(caseResult) || MISSING_STUDY_VALUE : caseResult;
    const filled = report === MISSING_STUDY_VALUE ? measuredExample(study.id, caseResult, context) : '';
    const simulated = filled || (caseResult ? null : exampleValue(study, context));
    supplemental.push({
      id: study.id, label: study.label,
      reply: filled || (report ?? (simulated || (['radiografia', 'ecografia'].includes(study.id)
        ? 'Indica la región de la imagen para consultar el resultado.' : numeric ? MISSING_STUDY_VALUE : 'El caso no trae un resultado para este estudio.'))),
      kind: report && report !== MISSING_STUDY_VALUE ? 'case' : simulated ? 'simulated' : 'unavailable',
    });
  }
  if (!documented.length && !supplemental.length) {
    supplemental.push({ id: 'unknown-study', label: 'Paraclínico solicitado',
      reply: generic ? 'Indica el nombre del estudio. Para una imagen, incluye también la región.'
        : 'El caso no trae un resultado para ese estudio. Si pediste una imagen, indica la región.', kind: 'unavailable' });
  }
  return { documented: documented.map((item) => displayStoredStudy(data, item)), supplemental };
}
