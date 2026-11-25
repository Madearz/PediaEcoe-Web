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

export function withPracticeDecisions(id, station, shuffle) {
  const { public: data, rubric } = station;
  const ids = new Set(data.interactions.map((item) => item.id));
  const sample = reasoningSamples[id];
  const reasoning = !rubric.reasoning && sample && ids.has(sample.diagnosis) && sample.support.every((item) => ids.has(item));
  const treatment = id === 'demo-deshidratacion' && !data.treatmentOptions && !rubric.prescription && ids.has('567f73dd8d76')
    && data.opening === 'Desde ayer ha ido muchas veces al baño. Ha pedido agua más de lo normal.';
  return {
    public: data.treatmentOptions || treatment ? { ...data,
      ...(treatment ? { scenario: `${data.scenario} Para la pauta de rehidratación, usa el Plan B de la OMS.` } : {}),
      treatmentOptions: shuffle(data.treatmentOptions ?? oralRehydration.options),
    } : data,
    rubric: { ...rubric, ...(reasoning ? { reasoning: [sample] } : {}), ...(treatment ? { prescription: oralRehydration.key } : {}) },
  };
}
