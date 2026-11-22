import { normalizeClinicalRequest } from './exam.mjs';

// Representative simulation values for findings that already have a direction in the case.
const measurements = {
  sodio: [
    [/hiponatremia (?:marcada|grave|severa)/, 'Sodio 119 mmol/L.'],
    [/hiponatremia moderada/, 'Sodio 128 mmol/L.'],
    [/hiponatremia|sodio (?:bajo|disminuido)/, 'Sodio 132 mmol/L.'],
    [/hipernatremia (?:marcada|grave|severa)/, 'Sodio 162 mmol/L.'],
    [/hipernatremia|sodio (?:alto|elevado)/, 'Sodio 152 mmol/L.'],
    [/sodio (?:normal|conservado)/, 'Sodio 140 mmol/L.'],
  ],
  potasio: [
    [/hipopotasemia|hipokalemia|potasio (?:bajo|disminuido)/, 'Potasio 2,8 mmol/L.'],
    [/hiperpotasemia|hiperkalemia|potasio (?:alto|elevado)/, 'Potasio 6,2 mmol/L.'],
    [/potasio (?:normal|conservado)/, 'Potasio 4,2 mmol/L.'],
  ],
  glucosa: [
    [/gluc(?:osa|emia)(?: y osmolalidad)? muy elevad[ao]s?|hiperglucemia marcada/, 'Glucosa 680 mg/dL.'],
    [/hiperglucemia|hiperglicemia|gluc(?:osa|emia|icemia) (?:alta|elevada)/, 'Glucosa 340 mg/dL.'],
    [/hipoglucemia|hipoglicemia|gluc(?:osa|emia|icemia) (?:baja|disminuida)/, 'Glucosa 48 mg/dL.'],
    [/gluc(?:osa|emia|icemia) (?:normal|conservada)/, 'Glucosa 90 mg/dL.'],
  ],
  cetonas: [
    [/ceton(?:as|emia) elevad[ao]s?|cetosis marcada/, 'Cetonas 4,0 mmol/L.'],
    [/cetosis escasa/, 'Cetonas 0,8 mmol/L.'],
  ],
  hemoglobina: [
    [/anemia microcitica/, 'Hemoglobina 9,6 g/dL.'],
    [/caida de hemoglobina/, 'Hemoglobina previa 11,8 g/dL; actual 8,9 g/dL.'],
  ],
  vcm: [[/microcitosis|anemia microcitica/, 'VCM 68 fL.']],
  ferritina: [[/ferritina (?:baja|disminuida)/, 'Ferritina 8 ng/mL.']],
  reticulocitos: [[/reticulocitos (?:muy )?(?:bajos|disminuidos)/, 'Reticulocitos 0,3 %.']],
  hematocrito: [[/hematocrito (?:ascendente|en ascenso)/, 'Hematocrito previo 36 %; actual 43 %.']],
  eosinofilos: [[/eosinofilia persistente/, 'Eosinófilos 1.250/µL.']],
  creatinina: [[/creatinina (?:en ascenso|ascendente)/, 'Creatinina previa 0,4 mg/dL; actual 0,9 mg/dL.']],
  coagulacion: [[/coagulacion alterada|alteracion de coagulacion/, 'INR 1,8.']],
  hepatica: [[/patron hepatocelular agudo/, 'ALT 620 U/L; AST 480 U/L.']],
  bilirrubina: [[/bilirrubina directa (?:alta|elevada)/, 'Bilirrubina directa 3,2 mg/dL.']],
  albumina: [[/albumina (?:baja|disminuida)/, 'Albúmina 2,1 g/dL.']],
  complemento: [
    [/(?:complemento|c3) (?:bajo|disminuido)/, 'Complemento C3 55 mg/dL.'],
    [/(?:complemento|c3) (?:normal|conservado)/, 'Complemento C3 105 mg/dL.'],
  ],
};

function measurement(id, text, context) {
  if (/\b(?:neonat\w*|recien nacido|\d+ (?:dias?|semanas?)|[1-5] meses?)\b/.test(context)) {
    if (['hemoglobina', 'vcm', 'ferritina'].includes(id)) return '';
    if (id === 'glucosa' && /hipoglucemia|hipoglicemia|gluc(?:osa|emia|icemia) (?:baja|disminuida)/.test(text)) return 'Glucosa 35 mg/dL.';
    if (id === 'glucosa' && /gluc(?:osa|emia) en descenso/.test(text)) return 'Glucosa previa 56 mg/dL; actual 42 mg/dL.';
    if (id === 'glucosa' && /gluc(?:osa|emia) limitrofe/.test(text)) return 'Glucosa 45 mg/dL.';
  }
  if (id === 'hemoglobina' && /falciform|drepanocit/.test(context) && /hemoglobina (?:notablemente )?menor al basal/.test(text)) {
    return 'Hemoglobina basal 8,2 g/dL; actual 5,6 g/dL.';
  }
  if (id === 'potasio' && /potasio (?:alto|elevado)|hiperpotasemia|hiperkalemia/.test(text)
    && /ondas? t picudas|qrs ancho/.test(text)) return 'Potasio 6,8 mmol/L.';
  return measurements[id]?.find(([pattern]) => pattern.test(text))?.[1] ?? '';
}

export function measuredExample(id, report, context) {
  if (!report) return '';
  const text = normalizeClinicalRequest(report);
  if (/\b(sospech\w*|posible|pendiente|por confirmar|en estudio|por valorar|descartar)\b/.test(text)
      || /\b(?:sin|no hay|no presenta) (?:datos de |signos de )?(?:hipo|hiper|anemia)/.test(text)) return '';
  const analytes = id === 'hemograma' ? ['hemoglobina', 'vcm', 'hematocrito', 'eosinofilos']
    : id === 'electrolitos' ? ['sodio', 'potasio'] : [id];
  return analytes.map((analyte) => measurement(analyte, text, context)).filter(Boolean).join(' ');
}
