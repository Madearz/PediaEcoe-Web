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
  'practica100-asma-pecho-silente': {
    action: '3f5c4021a773c1', opening: 'Al inicio silbaba fuerte y ahora casi no se oye, pero le cuesta más respirar.',
    context: 'Mientras se activa el equipo de reanimación y se prepara apoyo ventilatorio, elige el esquema inicial para la exacerbación asmática grave.',
    options: [
      { id: 'asma-rescate', label: 'Salbutamol e ipratropio inhalados, corticoide sistémico temprano y oxígeno según saturación.' },
      { id: 'asma-alto-flujo-solo', label: 'Cánula nasal de alto flujo como única medida, sin broncodilatadores de rescate.' },
      { id: 'asma-antibiotico-solo', label: 'Ceftriaxona intravenosa como primera medida para resolver el broncoespasmo.' },
    ],
    key: { accepted: ['asma-rescate'], source: 'Royal Children’s Hospital. Acute asthma. https://www.rch.org.au/clinicalguide/guideline_index/Asthma_Acute/',
      explanation: 'El pecho silente con fatiga puede indicar deterioro ventilatorio. Los broncodilatadores de rescate y el corticoide se acompañan de soporte, reevaluación inmediata y escalamiento si hace falta.' },
  },
  'practica100-asma-alta': {
    action: '3543171c8c48a2', opening: 'Ya respira mejor, pero en casa no sabemos usar el espaciador.',
    context: 'Si el equipo confirma criterios de alta y prescribe salbutamol en inhalador como rescate, elige cómo preparar el manejo en casa.',
    options: [
      { id: 'asma-alta-espaciador', label: 'Salbutamol con espaciador según el plan de rescate, demostración de técnica y revisión del tratamiento controlador y del seguimiento.' },
      { id: 'asma-alta-antibiotico', label: 'Sustituir el inhalador de rescate por amoxicilina oral.' },
      { id: 'asma-alta-sin-entrenar', label: 'Indicar salbutamol sin espaciador y omitir la comprobación de la técnica.' },
    ],
    key: { accepted: ['asma-alta-espaciador'], source: 'Royal Children’s Hospital. Acute asthma. https://www.rch.org.au/clinicalguide/guideline_index/Asthma_Acute/',
      explanation: 'Antes del alta se revisan la técnica, el acceso a los inhaladores, el plan escrito y el seguimiento.' },
  },
  'practica100-bronquiolitis-apnea': {
    action: '0c01726b422211', opening: 'Desde ayer está congestionado y hoy se quedó unos segundos sin respirar.',
    context: 'Tras la valoración urgente, la ventilación espontánea se mantiene sin nuevas apneas. Persiste la hipoxemia y no mejora el trabajo respiratorio con oxígeno de bajo flujo. Elige el siguiente soporte bajo monitorización.',
    options: [
      { id: 'bronquiolitis-alto-flujo', label: 'Cánula nasal de alto flujo con monitorización y reevaluación estrecha por el equipo pediátrico.' },
      { id: 'bronquiolitis-salbutamol', label: 'Salbutamol nebulizado de rutina como sustituto del soporte de oxígeno.' },
      { id: 'bronquiolitis-aire-ambiente', label: 'Retirar el oxígeno y observar en aire ambiente pese a la hipoxemia persistente.' },
    ],
    key: { accepted: ['bronquiolitis-alto-flujo'], source: 'Royal Children’s Hospital. Bronchiolitis. https://www.rch.org.au/clinicalguide/guideline_index/Bronchiolitis_Guideline/',
      explanation: 'El alto flujo es una opción de escalamiento cuando persisten la hipoxemia y la dificultad respiratoria pese al bajo flujo. Las apneas recurrentes o la ventilación insuficiente obligan a reevaluar de inmediato el soporte ventilatorio.' },
  },
  'practica100-neumonia-derrame': {
    action: '78d26abcdd0f47', opening: 'Ya está en tratamiento, pero sigue con fiebre y le duele al respirar profundo.',
    context: 'Para esta decisión, supón que el cultivo del líquido pleural confirma Staphylococcus aureus resistente a meticilina (SARM). Elige el antibiótico dirigido mientras el equipo valora el drenaje.',
    options: [
      { id: 'empiema-vancomicina', label: 'Vancomicina intravenosa con ajuste y monitorización por el equipo hospitalario.' },
      { id: 'empiema-ceftriaxona-sola', label: 'Ceftriaxona intravenosa como único antibiótico dirigido al SARM.' },
      { id: 'empiema-amoxicilina', label: 'Amoxicilina oral como único antibiótico dirigido al SARM.' },
    ],
    key: { accepted: ['empiema-vancomicina'], source: 'PIDS/IDSA. Pediatric community-acquired pneumonia. https://pmc.ncbi.nlm.nih.gov/articles/PMC7107838/',
      explanation: 'El supuesto de la pregunta confirma SARM, por lo que se elige un antibiótico activo frente al cultivo. El manejo del derrame y la vigilancia de la función renal se coordinan en el hospital.' },
  },
  'practica100-cefalea-meningismo': {
    action: 'eb06e26eb1363e', opening: 'Tiene dolor de cabeza desde ayer y hoy se le cayó un vaso de la mano.',
    context: 'Ante sospecha de meningitis bacteriana, la focalidad obliga a diferir la punción lumbar. Elige qué iniciar mientras se evalúa la seguridad del procedimiento.',
    options: [
      { id: 'meningismo-ceftriaxona', label: 'Iniciar ceftriaxona intravenosa como parte del esquema empírico del protocolo local, sin esperar la punción lumbar.' },
      { id: 'meningismo-esperar', label: 'Diferir los antimicrobianos hasta obtener el resultado del líquido cefalorraquídeo.' },
      { id: 'meningismo-amoxicilina', label: 'Dar amoxicilina oral como único tratamiento inicial y reevaluar al día siguiente.' },
    ],
    key: { accepted: ['meningismo-ceftriaxona'], source: 'Royal Children’s Hospital. Meningitis and encephalitis. https://www.rch.org.au/clinicalguide/guideline_index/Meningitis_and_encephalitis/',
      explanation: 'La focalidad cambia la secuencia de la punción lumbar. El esquema intravenoso empírico se inicia sin esperar ese procedimiento y se ajusta al protocolo y a los hallazgos.' },
  },
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
      ...(treatment && course.context ? { treatmentPrompt: course.context } : {}),
      treatmentOptions: shuffle(data.treatmentOptions ?? course.options),
    } : data,
    rubric: { ...rubric, ...(reasoning ? { reasoning: [sample] } : {}), ...(treatment ? { prescription: course.key } : {}) },
  };
}
