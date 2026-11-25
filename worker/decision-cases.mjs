const reasoningSamples = {
  'demo-bronquiolitis': { diagnosis: '20470a640482', support: ['bf1bb96fdb65', '606a533ae3ae'] },
  'demo-deshidratacion': { diagnosis: '59d0c4d6ccc7', support: ['fe7ddf8e3d8f', '1835c08f8133'] },
  'demo-convulsion-febril': { diagnosis: '5f14036629da', support: ['3611e1699a42', 'f746b64cc843'] },
};

const oralRehydration = {
  options: [
    { id: 'sro-25-oral', label: 'Solución de rehidratación oral, 25 mL/kg en 4 horas.' },
    { id: 'sro-75-oral', label: 'Solución de rehidratación oral, 75 mL/kg en 4 horas.' },
    { id: 'sro-150-oral', label: 'Solución de rehidratación oral, 150 mL/kg en la primera hora.' },
  ],
  key: {
    accepted: ['sro-75-oral'],
    source: 'OMS. Pocket Book of Hospital Care for Children, Plan B. https://iris.who.int/handle/10665/43206',
    explanation: 'En esta estación se practica el Plan B para deshidratación sin choque. La pauta se administra por vía oral y se reevalúa la hidratación al terminar el plan inicial.',
  },
};

const courseSamples = {
  'demo-deshidratacion': {
    action: '567f73dd8d76', opening: 'Desde ayer ha ido muchas veces al baño. Ha pedido agua más de lo normal.',
    context: 'Para la pauta de rehidratación, usa el Plan B de la OMS.', ...oralRehydration,
  },
  'practica100-hipoglucemia-ayuno': {
    action: '22ee5f1148a10b', opening: 'No ha comido y de repente se puso pálido y muy dormido.',
    context: 'Para la corrección inicial intravenosa de la hipoglucemia grave, usa el protocolo del Royal Children’s Hospital.',
    options: [
      { id: 'glucosa-2-iv', label: 'Glucosa al 10 %, 2 mL/kg por vía intravenosa en bolo.' },
      { id: 'glucosa-02-iv', label: 'Glucosa al 10 %, 0,2 mL/kg por vía intravenosa en bolo.' },
      { id: 'glucosa-2-oral', label: 'Glucosa al 10 %, 2 mL/kg por vía oral pese a la somnolencia.' },
    ],
    key: { accepted: ['glucosa-2-iv'],
      source: 'Royal Children’s Hospital. Hypoglycaemia. https://www.rch.org.au/clinicalguide/guideline_index/Hypoglycaemia_Guideline/',
      explanation: 'En hipoglucemia grave, la guía usa glucosa al 10 % por vía intravenosa en bolo. Reevalúa glucemia y estado de conciencia tras la corrección inicial.' },
  },
  'practica100-ferropenia-adolescente': {
    action: '2cd53861509a74', opening: 'Últimamente me mareo y mi menstruación dura más que antes.',
    context: 'Si inicias hierro oral, elige la pauta general por peso del Royal Children’s Hospital y considera el límite de la presentación.',
    options: [
      { id: 'hierro-prevencion', label: 'Hierro elemental oral, 1 mg/kg/día como tratamiento de la anemia.' },
      { id: 'hierro-tratamiento', label: 'Hierro elemental oral, 3–6 mg/kg/día, ajustado al límite de la presentación.' },
      { id: 'hierro-cada-dosis', label: 'Hierro elemental oral, 3–6 mg/kg por dosis, cada 8 horas.' },
    ],
    key: { accepted: ['hierro-tratamiento'],
      source: 'Royal Children’s Hospital. Iron deficiency. https://www.rch.org.au/clinicalguide/guideline_index/Iron_deficiency/',
      explanation: 'El rango corresponde al total de hierro elemental del día y debe ajustarse a la formulación y a la gravedad. También hay que evaluar la causa de las pérdidas.' },
  },
  'practica100-oxiuriasis-recaida-domestica': {
    action: '47194444cb276c', opening: 'Ya le había pasado y ahora su hermano también se rasca de noche.',
    context: 'Si se dispone de albendazol, selecciona la pauta para este paciente según los CDC.',
    options: [
      { id: 'albendazol-una', label: 'Albendazol 400 mg por vía oral, una sola toma sin segunda dosis.' },
      { id: 'albendazol-cada-dia', label: 'Albendazol 400 mg por vía oral, todos los días durante dos semanas.' },
      { id: 'albendazol-repetir', label: 'Albendazol 400 mg por vía oral, una toma y repetir a las dos semanas.' },
    ],
    key: { accepted: ['albendazol-repetir'], source: 'CDC. Clinical Overview of Pinworm Infection. https://www.cdc.gov/pinworm/hcp/clinical-overview/index.html',
      explanation: 'La segunda toma cubre los parásitos que eclosionan después de la primera. El manejo familiar y la higiene ayudan a prevenir la reinfección.' },
  },
  'practica100-dengue-ambulatorio': {
    action: '144a2ef7a4eb73', opening: 'Hay dengue en el barrio y tengo fiebre, pero sigo tomando agua.',
    context: 'Si requiere un antipirético, selecciona la pauta pediátrica de la OPS para dengue sin signos de alarma.',
    options: [
      { id: 'dengue-pcm', label: 'Acetaminofén 10 mg/kg por dosis, por vía oral cada 6 horas si lo necesita.' },
      { id: 'dengue-aines', label: 'Ibuprofeno por vía oral como antipirético de primera elección.' },
      { id: 'dengue-pcm-intervalo', label: 'Acetaminofén 10 mg/kg por dosis, por vía oral cada 2 horas.' },
    ],
    key: { accepted: ['dengue-pcm'], source: 'OPS. Algoritmos para el manejo clínico del dengue. https://www.paho.org/sites/default/files/2024-05/2024-cde-algoritmos-manejo-clinico-dengue-es_0.pdf',
      explanation: 'El acetaminofén es el antipirético recomendado en este escenario. El seguimiento incluye hidratación y vigilancia de los signos de alarma al descender la fiebre.' },
  },
  'practica100-crup-observacion': {
    action: 'c039fd76d46e4a', opening: 'Parecía estar mucho mejor y volvió a respirar con ruido estando tranquilo.',
    context: 'Si la reevaluación confirma crup moderado o grave y se indica adrenalina L, selecciona la pauta nebulizada según la Canadian Paediatric Society.',
    options: [
      { id: 'crup-adrenalina', label: 'Adrenalina L 1 mg/mL, 5 mL por nebulización, con observación posterior.' },
      { id: 'crup-adrenalina-iv', label: 'Adrenalina L 1 mg/mL, 5 mL en bolo intravenoso.' },
      { id: 'crup-nebulizar-alta', label: 'Adrenalina L 1 mg/mL, 5 mL por nebulización y alta inmediata al mejorar.' },
    ],
    key: { accepted: ['crup-adrenalina'], source: 'Canadian Paediatric Society. Acute management of croup. https://cps.ca/en/documents/position/acute-management-of-croup',
      explanation: 'El efecto de la adrenalina nebulizada es transitorio. Se necesita observación posterior y reevaluación antes de considerar el alta.' },
  },
};

function bankDecisions(data, rubric) {
  const actions = data.interactions.filter(({ group }) => group === 'acciones');
  const followUps = data.interactions.filter(({ group }) => group === 'cierre');
  const expected = new Set(rubric.criteria.map(({ id }) => id));
  const action = actions.find(({ id }) => expected.has(id));
  const wrongAction = actions.find(({ id }) => !expected.has(id));
  const followUp = followUps.find(({ id }) => expected.has(id));
  const wrongFollowUp = followUps.find(({ id }) => !expected.has(id));
  if (!action || !wrongAction || !followUp || !wrongFollowUp) return null;
  const options = [action, wrongAction].flatMap((plan, index) => [followUp, wrongFollowUp].map((check, position) => ({
    id: `plan-${index}-${position}`,
    label: [plan.label, check.label].map((label) => label.replace(/[.!?]+$/, '')).join('. ') + '.',
  })));
  if (options.some(({ label }) => label.length > 240)) return null;
  return { options, key: { accepted: ['plan-0-0'], source: rubric.reference,
    explanation: 'En esta estación se evalúa el conjunto de la conducta inicial y el seguimiento o la comunicación del plan.' } };
}

export function withPracticeDecisions(id, station, shuffle) {
  const { public: data, rubric } = station;
  const ids = new Set(data.interactions.map((item) => item.id));
  const bankCase = id.startsWith('practica100-');
  const support = bankCase ? rubric.criteria.filter(({ domain }) => domain === 1).map(({ id }) => id).slice(0, 8) : [];
  const sample = reasoningSamples[id] ?? (support.length ? { diagnosis: rubric.criteria.find(({ domain }) => domain === 2)?.id, support } : null);
  const reasoning = !rubric.reasoning && sample && ids.has(sample.diagnosis) && sample.support.every((item) => ids.has(item));
  const sampleCourse = courseSamples[id];
  const course = sampleCourse && ids.has(sampleCourse.action) && data.opening === sampleCourse.opening ? sampleCourse
    : bankCase ? bankDecisions(data, rubric) : null;
  const treatment = course && !data.treatmentOptions && !rubric.prescription;
  return {
    public: data.treatmentOptions || treatment ? { ...data,
      ...(treatment && course.context ? { scenario: `${data.scenario} ${course.context}` } : {}),
      treatmentOptions: shuffle(data.treatmentOptions ?? course.options),
    } : data,
    rubric: { ...rubric, ...(reasoning ? { reasoning: [sample] } : {}), ...(treatment ? { prescription: course.key } : {}) },
  };
}
