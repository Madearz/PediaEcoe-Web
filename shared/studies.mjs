import { normalizeClinicalRequest } from './exam.mjs';

const renal = /renal|nefro|diuresis|urinari|orina|hematuria|oliguria|enuresis|deshidrat|edema/;
const metabolic = /diabetes|gluc|metabol|cetona|deshidrat|somnolen|ayuno|convulsion|conciencia|intoxic|neonat|recien nacido/;
const chest = /respirat|pulmon|neumon|sibilan|asma|tos\b|estridor|saturacion|taquipnea|torax|cardiac|cardiovasc|corazon/;
const fever = /fiebre|febril|infect|sepsis|inflama|exantema|dengue|malaria/;
const electrolytes = /electrol|sodio|potasio|diur[ée]tic|arritmia|vomit|diarre|metabol|deshidrat|neonat|recien nacido/;

const studies = [
  { id: 'hemograma', label: 'Hemograma', aliases: /(?:hemograma|cuadro hematico|biometria hematica|conteo sanguineo)/,
    related: [fever, /anemia|sangrad|hematolog|hemorrag|petequia|palidez|purpura|fatiga|falciform|neumon/],
    normal: 'Hemoglobina, leucocitos y plaquetas dentro de los intervalos esperados para la edad.' },
  { id: 'glucosa', label: 'Glucosa', aliases: /(?:glucemia|glicemia|glucometria|glucosa)/,
    related: [metabolic], normal: 'Glucosa 90 mg/dL.' },
  { id: 'sodio', label: 'Sodio', aliases: /sodio/, related: [renal, electrolytes], normal: 'Sodio 140 mmol/L.' },
  { id: 'potasio', label: 'Potasio', aliases: /potasio/, related: [renal, electrolytes], normal: 'Potasio 4,2 mmol/L.' },
  { id: 'electrolitos', label: 'Electrolitos', aliases: /(?:electrolitos|ionograma)/, related: [renal, electrolytes],
    normal: 'Sodio 140 mmol/L y potasio 4,2 mmol/L.' },
  { id: 'creatinina', label: 'Creatinina', aliases: /(?:creatinina|perfil renal|funcion renal)/, related: [renal, /choque|hipertension|intoxic/],
    normal: 'Creatinina dentro del intervalo de referencia para la edad.' },
  { id: 'hepatica', label: 'Perfil hepático', aliases: /(?:perfil hepatico|funcion hepatica|transaminasas|ast y alt)/,
    related: [/hepat|icter|bilirrub|paracetamol|intoxic|choque|neonat|recien nacido/],
    normal: 'Transaminasas y bilirrubina dentro de los intervalos esperados para la edad.' },
  { id: 'coagulacion', label: 'Pruebas de coagulación', aliases: /(?:pruebas? de coagulacion|perfil de coagulacion|coagulograma|inr)/,
    related: [/sangrad|hemorrag|coagul|petequia|purpura|hepat|sepsis|trauma/],
    normal: 'Tiempo de protrombina y tiempo de tromboplastina parcial dentro de los intervalos de referencia.' },
  { id: 'gasometria', label: 'Gasometría', aliases: /(?:gasometria(?: arterial| venosa)?|gases (?:arteriales|venosos))/,
    related: [chest, metabolic, /choque|acidosis|hipoperfusion/],
    normal: 'pH y bicarbonato dentro del intervalo esperado para el tipo de muestra.' },
  { id: 'orina', label: 'Análisis de orina', aliases: /(?:uroanalisis|parcial de orina|analisis de orina|examen de orina|examen general de orina|tira de orina)/,
    related: [renal, fever, metabolic], normal: 'Tira reactiva sin sangre, proteínas, nitritos ni esterasa leucocitaria.' },
  { id: 'urocultivo', label: 'Urocultivo', aliases: /(?:urocultivo|cultivo de orina)/,
    related: [renal, fever], normal: 'Sin crecimiento bacteriano significativo.' },
  { id: 'pcr', label: 'Proteína C reactiva', aliases: /(?:proteina c reactiva|pcr cuantitativa|pcr inflamatoria)/,
    related: [fever, chest, /artritis|apendic|inflam|vasculit/], normal: 'Dentro del intervalo de referencia del laboratorio.' },
  { id: 'ecg', label: 'Electrocardiograma', aliases: /(?:ecg|ekg|electrocardiograma)/,
    related: [chest, electrolytes, /sincop|arritmia|palpitacion|taquicardia|choque|dolor torac|intoxic/],
    normal: 'Ritmo sinusal, con intervalos adecuados para la edad.' },
  { id: 'rx-torax', label: 'Radiografía de tórax', aliases: /(?:(?:radiografia|rx|placa) (?:de |del )?torax)/,
    related: [chest, /trauma|cuerpo extrano|aspiracion/], normal: 'Sin consolidación focal, derrame pleural ni neumotórax.' },
  { id: 'eco-abdomen', label: 'Ecografía abdominal', aliases: /(?:(?:eco|ecografia|ultrasonido) (?:de |del )?abdomen|ecografia abdominal|ultrasonido abdominal)/,
    related: [renal, /abdom|hepat|ascitis|vomit|diarre|diges|apendic|masa|trauma/],
    normal: 'Sin hallazgos abdominales relevantes en el informe simulado.' },
  { id: 'neuroimagen', label: 'Neuroimagen', aliases: /(?:neuroimagen|tomografia craneal|tac craneal|tomografia de craneo|resonancia cerebral)/,
    related: [/neuro|cefalea|convulsion|focalidad|trauma|encefal|conciencia|cefalo/], normal: null },
];

const studyRequest = /\b(solicit\w*|pedir|pido|ordeno|ordenar|quisiera|quiero|dame|muestr\w*|resultados?|paraclinic[oa]s?|realiz\w*|me (?:da|dice|indica)|tom\w*|mido|hacer|como (?:esta|salio)|cual (?:es|fue))\b/;

function matchesStudy(study, text) {
  return new RegExp(`\\b${study.aliases.source}\\b`).test(text);
}

export function requestedStudies(data, question) {
  const text = normalizeClinicalRequest(question);
  const requested = studies.filter((study) => matchesStudy(study, text));
  const explicit = studyRequest.test(text);
  const generic = /\bparaclinic[oa]s?\b/.test(text);
  const documented = data.interactions.filter((item) => item.group === 'paraclinicos' && item.reply
    && (text === normalizeClinicalRequest(item.label)
      || (generic && !requested.length)
      || requested.some((study) => matchesStudy(study, normalizeClinicalRequest(item.label)))));
  const remainder = requested.reduce((current, study) =>
    current.replace(new RegExp(`\\b${study.aliases.source}\\b`, 'g'), ' '), text);
  const bare = requested.length > 0 && /^(?:(?:y|o|el|la|los|las|un|una|por favor)\b\s*|\s+)*$/.test(remainder);
  if (!explicit && !bare && !documented.some((item) => text === normalizeClinicalRequest(item.label))) return null;
  if (!requested.length && !documented.length && !generic
      && !/\b(hemocultivos?|cultivos?|radiografias?|ecografias?|tomografias?|resonancia|prueba de laboratorio)\b/.test(text)) return null;

  const stored = new Set(documented.map((item) => normalizeClinicalRequest(item.label)));
  const context = normalizeClinicalRequest([data.title, data.category, data.scenario, data.opening,
    ...data.interactions.map((item) => item.label + ' ' + item.reply)].join(' '));
  const supplemental = [];
  for (const study of requested) {
    if ([...stored].some((label) => matchesStudy(study, label))) continue;
    const includedInExam = data.interactions.find((item) => item.group === 'exploracion' && item.reply
      && matchesStudy(study, normalizeClinicalRequest(item.reply)));
    const normal = !includedInExam && !study.related.some((pattern) => pattern.test(context)) ? study.normal : null;
    supplemental.push({
      id: study.id, label: study.label,
      reply: includedInExam?.reply ?? (normal || 'El caso no trae un resultado para este estudio.'),
      kind: includedInExam ? 'case' : normal ? 'simulated' : 'unavailable',
    });
  }
  if (!documented.length && !supplemental.length) {
    supplemental.push({ id: 'unknown-study', label: 'Paraclínico solicitado',
      reply: generic ? 'Indica el nombre del estudio. Para una imagen, incluye también la región.'
        : 'El caso no trae un resultado para ese estudio. Si pediste una imagen, indica la región.', kind: 'unavailable' });
  }
  return { documented, supplemental };
}
