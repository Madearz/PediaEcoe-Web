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
};

export function withPracticeDecisions(id, station, shuffle) {
  const { public: data, rubric } = station;
  const ids = new Set(data.interactions.map((item) => item.id));
  const sample = reasoningSamples[id];
  const reasoning = !rubric.reasoning && sample && ids.has(sample.diagnosis) && sample.support.every((item) => ids.has(item));
  const course = courseSamples[id];
  const treatment = course && !data.treatmentOptions && !rubric.prescription && ids.has(course.action)
    && data.opening === course.opening;
  return {
    public: data.treatmentOptions || treatment ? { ...data,
      ...(treatment ? { scenario: `${data.scenario} ${course.context}` } : {}),
      treatmentOptions: shuffle(data.treatmentOptions ?? course.options),
    } : data,
    rubric: { ...rubric, ...(reasoning ? { reasoning: [sample] } : {}), ...(treatment ? { prescription: course.key } : {}) },
  };
}
