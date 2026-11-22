import { normalizeClinicalRequest } from './exam.mjs';

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
    normal: 'Hemoglobina, leucocitos y plaquetas dentro de los intervalos esperados para la edad.' },
  { id: 'hemoglobina', label: 'Hemoglobina', aliases: /(?:hemoglobina|hb)/,
    related: [anemia], normal: 'Hemoglobina dentro del intervalo esperado para la edad.' },
  { id: 'vcm', label: 'Volumen corpuscular medio', aliases: /(?:volumen corpuscular medio|vcm)/,
    related: [anemia], normal: 'Volumen corpuscular medio dentro del intervalo esperado para la edad.' },
  { id: 'ferritina', label: 'Ferritina', aliases: /(?:ferritina|perfil de hierro)/,
    related: [anemia, fever], normal: 'Ferritina dentro del intervalo de referencia del laboratorio.' },
  { id: 'hematocrito', label: 'Hematocrito', aliases: /(?:hematocrito|hto)/,
    related: [anemia, /dengue|choque|deshidrat/], normal: 'Hematocrito dentro del intervalo esperado para la edad.' },
  { id: 'plaquetas', label: 'Plaquetas', aliases: /(?:plaquetas|recuento plaquetario)/,
    related: [anemia, fever, /petequia|purpura|coagul|trombocit/], normal: 'Plaquetas 250.000/µL.' },
  { id: 'reticulocitos', label: 'Reticulocitos', aliases: /reticulocitos/,
    related: [anemia, /aplas|hemoli/], normal: 'Recuento de reticulocitos dentro del intervalo esperado para la edad.' },
  { id: 'glucosa', label: 'Glucosa', aliases: /(?:glucemia|glicemia|glucometria|glucosa)/,
    related: [metabolic], normal: 'Glucosa 90 mg/dL.' },
  { id: 'cetonas', label: 'Cetonas', aliases: /(?:cetonas|cetonemia|cetonuria|cuerpos cetonicos)/,
    related: [metabolic], normal: 'Sin cetonas elevadas en la muestra simulada.' },
  { id: 'sodio', label: 'Sodio', aliases: /sodio/, related: [renal, electrolytes], normal: 'Sodio 140 mmol/L.' },
  { id: 'potasio', label: 'Potasio', aliases: /potasio/, related: [renal, electrolytes], normal: 'Potasio 4,2 mmol/L.' },
  { id: 'electrolitos', label: 'Electrolitos', aliases: /(?:electrolitos|ionograma)/, related: [renal, electrolytes],
    normal: 'Sodio 140 mmol/L y potasio 4,2 mmol/L.' },
  { id: 'creatinina', label: 'Creatinina', aliases: /(?:creatinina|perfil renal|funcion renal)/, related: [renal, /choque|hipertension|intoxic/],
    normal: 'Creatinina dentro del intervalo de referencia para la edad.' },
  { id: 'hepatica', label: 'Perfil hepático', aliases: /(?:perfil hepatico|funcion hepatica|transaminasas|ast y alt|pruebas hepaticas)/,
    related: [/hepat|icter|bilirrub|paracetamol|intoxic|choque|neonat|recien nacido/],
    normal: 'Transaminasas y bilirrubina dentro de los intervalos esperados para la edad.' },
  { id: 'bilirrubina', label: 'Bilirrubina', aliases: /(?:bilirrubina(?: total| directa| indirecta| fraccionada)?)/,
    related: [/hepat|icter|bilirrub|hemoli|neonat|recien nacido/], normal: 'Bilirrubina dentro del intervalo esperado para la edad.' },
  { id: 'albumina', label: 'Albúmina', aliases: /albumina/, related: [renal, /hepat|albumin|desnutri/],
    normal: 'Albúmina dentro del intervalo de referencia.' },
  { id: 'coagulacion', label: 'Pruebas de coagulación', aliases: /(?:(?:pruebas? de |perfil de )?coagulacion|coagulograma|inr)/,
    related: [/sangrad|hemorrag|coagul|petequia|purpura|hepat|sepsis|trauma/],
    normal: 'Tiempo de protrombina y tiempo de tromboplastina parcial dentro de los intervalos de referencia.' },
  { id: 'gasometria', label: 'Gasometría', aliases: /(?:gasometria(?: arterial| venosa)?|gases (?:arteriales|venosos))/,
    related: [chest, metabolic, /choque|acidosis|hipoperfusion/],
    normal: 'pH y bicarbonato dentro del intervalo esperado para el tipo de muestra.' },
  { id: 'orina', label: 'Análisis de orina', aliases: /(?:uroanalisis|parcial de orina|analisis de orina|examen de orina|examen general de orina|tira de orina)/,
    related: [renal, fever, metabolic], normal: 'Tira reactiva sin sangre, proteínas, nitritos ni esterasa leucocitaria.' },
  { id: 'urocultivo', label: 'Urocultivo', aliases: /(?:urocultivo|cultivo de orina)/,
    related: [renal, fever], normal: 'Sin crecimiento bacteriano significativo.' },
  { id: 'complemento', label: 'Complemento C3', aliases: /(?:complemento(?: c3)?|c3)/,
    related: [renal, /lupus|inmun|complemento/], normal: 'Complemento C3 dentro del intervalo de referencia.' },
  { id: 'heces', label: 'Estudio de heces', aliases: /(?:coproparasitari[oa]|coproscopico|coprologico|(?:estudio|prueba|analisis) de heces|examen de heces)/,
    related: [digestive, /parasito|heces|giardia|ameb|uncinaria/], normal: 'Sin huevos, quistes ni parásitos en la muestra simulada.' },
  { id: 'pcr', label: 'Proteína C reactiva', aliases: /(?:proteina c reactiva|pcr cuantitativa|pcr inflamatoria)/,
    related: [fever, chest, /artritis|apendic|inflam|vasculit/], normal: 'Dentro del intervalo de referencia del laboratorio.' },
  { id: 'ecg', label: 'Electrocardiograma', aliases: /(?:ecg|ekg|electrocardiograma)/,
    related: [chest, electrolytes, /sincop|arritmia|palpitacion|taquicardia|choque|dolor torac|intoxic/],
    normal: 'Ritmo sinusal, con intervalos adecuados para la edad.' },
  { id: 'rx-torax', label: 'Radiografía de tórax', aliases: /(?:(?:radiografia|rx|placa) (?:de |del )?torax)/,
    related: [chest, /trauma|cuerpo extrano|aspiracion/], normal: 'Sin consolidación focal, derrame pleural ni neumotórax.' },
  { id: 'rx-abdomen', label: 'Radiografía de abdomen', aliases: /(?:(?:radiografia|rx|placa) (?:de |del )?abdomen|radiografia abdominal)/,
    related: [digestive], normal: 'Sin dilatación intestinal ni aire libre en el informe simulado.' },
  { id: 'eco-abdomen', label: 'Ecografía abdominal', aliases: /(?:(?:eco|ecografia|ultrasonido) (?:de |del )?abdomen|ecografia abdominal|ultrasonido abdominal)/,
    related: [renal, digestive],
    normal: 'Sin hallazgos abdominales relevantes en el informe simulado.' },
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
  hemograma: 'Hemoglobina 9,6 g/dL (baja) y VCM 68 fL (bajo). Persiste la microcitosis.',
  hemoglobina: 'Hemoglobina 9,6 g/dL (baja para la edad).',
  vcm: 'VCM 68 fL (bajo para la edad).',
  ferritina: 'Ferritina 8 ng/mL (baja).',
};

const reportTerms = {
  hemograma: /hemoglobin|microcitos|macrocitos|hemato[cq]rito|leucocit|eosinofil|plaquetas|trombocit|anemia/,
  hemoglobina: /anemia microcitica|anemia macrocitica/,
  vcm: /microcitos|macrocitos/,
  plaquetas: /trombocitopenia|trombocitosis/,
  glucosa: /hipoglucemia|hiperglucemia|hipoglicemia|hiperglicemia/,
  cetonas: /cetonemia|cetonuria|cetosis/,
  sodio: /hiponatremia|hipernatremia/,
  potasio: /hipopotasemia|hiperpotasemia|hipokalemia|hiperkalemia/,
  electrolitos: /hiponatremia|hipernatremia|hipopotasemia|hiperpotasemia|sodio|potasio/,
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

export function studySuggestions(data, caseId) {
  const results = stationStudyResults(data, caseId);
  const clinicalContext = studyContext(data, data.interactions.filter((item) => !['razonamiento', 'acciones', 'cierre'].includes(item.group)));
  const fullContext = studyContext(data);
  const existing = data.interactions.filter((item) => item.group === 'paraclinicos');
  const available = studies.filter((item) => !existing.some((entry) => matchesStudy(item, normalizeClinicalRequest(entry.label))));
  const curated = available.filter((item) => Object.hasOwn(results, item.id));
  const reported = curated.length ? curated.filter((item) => item.id !== 'vcm')
    : available.filter((item) => examReport(item, data) && !['hemoglobina', 'vcm'].includes(item.id));
  const related = available.filter((item) => item.related.some((pattern) => pattern.test(clinicalContext)));
  const examples = reported.length || existing.length ? [] : available.filter((item) => item.normal
    && !item.related.some((pattern) => pattern.test(fullContext))).slice(0, 1);
  return [...new Set([...reported, ...related.slice(0, examples.length ? 2 : 3), ...examples, ...related])]
    .slice(0, 3).map(({ id, label }) => ({ id, label, documented: reported.some((item) => item.id === id) }));
}

export function requestedStudies(data, question, caseId) {
  const text = normalizeClinicalRequest(question);
  const matched = studies.filter((study) => matchesStudy(study, text));
  const requested = matched.filter((study) =>
    !(study.id === 'ecografia' && matched.some((item) => item.id.startsWith('eco-')))
    && !(study.id === 'radiografia' && matched.some((item) => item.id.startsWith('rx-'))));
  const explicit = studyRequest.test(text);
  const generic = /\bparaclinic[oa]s?\b/.test(text);
  const documented = data.interactions.filter((item) => item.group === 'paraclinicos' && item.reply
    && (text === normalizeClinicalRequest(item.label)
      || (generic && !requested.length)
      || requested.some((study) => matchesStudy(study, normalizeClinicalRequest(item.label + ' ' + item.reply)))));
  const remainder = requested.reduce((current, study) =>
    current.replace(new RegExp(`\\b${study.aliases.source}\\b`, 'g'), ' '), text);
  const bare = requested.length > 0 && /^(?:(?:y|o|el|la|los|las|un|una|por favor)\b\s*|\s+)*$/.test(remainder);
  if (!explicit && !bare && !documented.some((item) => text === normalizeClinicalRequest(item.label))) return null;
  if (!requested.length && !documented.length && !generic
      && !/\b(hemocultivos?|cultivos?|radiografias?|ecografias?|tomografias?|resonancia|prueba de laboratorio)\b/.test(text)) return null;

  const stored = documented.map((item) => normalizeClinicalRequest(item.label + ' ' + item.reply));
  const context = studyContext(data);
  const results = stationStudyResults(data, caseId);
  const supplemental = [];
  for (const study of requested) {
    if (stored.some((label) => matchesStudy(study, label))) continue;
    const caseResult = results[study.id] ?? examReport(study, data);
    const normal = !caseResult && !study.related.some((pattern) => pattern.test(context)) ? study.normal : null;
    supplemental.push({
      id: study.id, label: study.label,
      reply: caseResult ?? (normal || (['radiografia', 'ecografia'].includes(study.id)
        ? 'Indica la región de la imagen para consultar el resultado.' : 'El caso no trae un resultado para este estudio.')),
      kind: caseResult ? 'case' : normal ? 'simulated' : 'unavailable',
    });
  }
  if (!documented.length && !supplemental.length) {
    supplemental.push({ id: 'unknown-study', label: 'Paraclínico solicitado',
      reply: generic ? 'Indica el nombre del estudio. Para una imagen, incluye también la región.'
        : 'El caso no trae un resultado para ese estudio. Si pediste una imagen, indica la región.', kind: 'unavailable' });
  }
  return { documented, supplemental };
}
