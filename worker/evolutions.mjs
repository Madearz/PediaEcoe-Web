const preset = (stable, stableNext, unstable) => ({
  indicated: { findings: stable, next: stableNext },
  alternative: { findings: unstable, next: 'escalar' },
});

// Scripted follow-ups for the simulation, displayed only after committing to a conduct.
export const evolutions = {
  'demo-bronquiolitis': preset(
    ['SpO₂ 96 % al aire ambiente.', 'Frecuencia respiratoria 42/min. Toleró una toma breve.'], 'observar',
    ['SpO₂ 89 % al aire ambiente.', 'Frecuencia respiratoria 64/min. Aumentó el tiraje y no toleró la toma.']),
  'demo-deshidratacion': preset(
    ['Frecuencia cardíaca 104/min.', 'Llenado capilar 2 s. Tolera sorbos y continúa con pérdidas.'], 'reevaluar',
    ['Frecuencia cardíaca 142/min.', 'Llenado capilar 4 s. No tolera líquidos y está somnoliento.']),
  'demo-convulsion-febril': preset(
    ['Temperatura 38,3 °C. No se repitió el episodio.', 'Está alerta y responde de forma habitual.'], 'observar',
    ['Temperatura 39,1 °C.', 'Permanece somnoliento y responde solo a estímulos intensos.']),
  'practica100-asma-pecho-silente': preset(
    ['SpO₂ 95 % con soporte.', 'Frecuencia respiratoria 30/min. Persiste retracción leve y puede hablar en frases.'], 'reevaluar',
    ['SpO₂ 86 %.', 'Frecuencia respiratoria 42/min. Aumentó el agotamiento y responde con palabras sueltas.']),
  'practica100-rehidratacion-falla-oral': preset(
    ['Frecuencia cardíaca 106/min.', 'Llenado capilar 2 s. Está despierto y tolera pequeños sorbos.'], 'reevaluar',
    ['Frecuencia cardíaca 148/min.', 'Llenado capilar 4 s. Continúan los vómitos y disminuyó el estado de alerta.']),
  'practica100-hipoglucemia-ayuno': preset(
    ['Glucosa capilar 82 mg/dL en el control.', 'Está más alerta y responde con claridad.'], 'reevaluar',
    ['Glucosa capilar 36 mg/dL en el control.', 'Aumentó la somnolencia y dejó de colaborar.']),
};

const diagnosisAlternatives = {
  'demo-bronquiolitis': ['Sibilancias recurrentes inducidas por virus'],
  'demo-deshidratacion': ['Cetoacidosis diabética', 'Infección urinaria febril'],
  'demo-convulsion-febril': ['Primera crisis no provocada', 'Infección del sistema nervioso central'],
  'practica100-asma-pecho-silente': ['Obstrucción por cuerpo extraño', 'Neumonía con compromiso respiratorio'],
  'practica100-rehidratacion-falla-oral': ['Apendicitis aguda', 'Cetoacidosis diabética'],
  'practica100-hipoglucemia-ayuno': ['Alteración de conciencia por intoxicación', 'Estado posictal'],
  'practica100-ferropenia-sin-respuesta': ['Rasgo talasémico como explicación principal', 'Anemia de la inflamación crónica como explicación principal'],
  'practica100-potasio-muestra': ['Hiperpotasemia asociada a lesión renal aguda', 'Hiperpotasemia por efecto de un medicamento'],
};
const existingDifferentials = { 'demo-bronquiolitis': ['b4978670f3d2', 'b98233076a8e'] };
const differentialNotes = {
  'demo-bronquiolitis': 'El pródromo catarral y las sibilancias difusas favorecen bronquiolitis. Un inicio brusco con asimetría orienta a aspiración; la fiebre persistente y un hallazgo focal orientan a neumonía.',
  'demo-deshidratacion': 'La diarrea y las pérdidas orientan al cuadro gastrointestinal. Pregunta si hubo poliuria o polidipsia antes de enfermar y busca síntomas urinarios si sospechas una infección urinaria.',
  'demo-convulsion-febril': 'La fiebre, el episodio breve y generalizado y la recuperación ayudan a distinguir este caso. La alteración persistente de conciencia o los signos meníngeos justifican considerar una infección del sistema nervioso central.',
  'practica100-asma-pecho-silente': 'La fatiga y la disminución de la entrada de aire tras las sibilancias indican gravedad en este escenario. Un atragantamiento brusco o hallazgos focales hacen considerar aspiración o neumonía.',
  'practica100-rehidratacion-falla-oral': 'La mala tolerancia oral explica la reevaluación. El dolor focal o la defensa cambian el diferencial; la poliuria o polidipsia previas orientan a estudiar una causa metabólica.',
  'practica100-hipoglucemia-ayuno': 'Contrasta el cambio de conducta con la glucemia y el ayuno. Pregunta por una posible exposición o por un episodio convulsivo previo si consideras intoxicación o estado posictal.',
  'practica100-ferropenia-sin-respuesta': 'Aclara cómo se ha usado el hierro antes de atribuir la falta de respuesta a otra causa. La persistencia tras un uso adecuado obliga a reconsiderar el diagnóstico y los antecedentes familiares o inflamatorios.',
  'practica100-potasio-muestra': 'Compara el primer resultado con la muestra sin hemólisis. Para una hiperpotasemia verdadera, revisa la función renal, los fármacos y los hallazgos del ECG.',
};

export function addDiagnosticChoices(id, data, rubric, shuffle) {
  if (!Object.hasOwn(diagnosisAlternatives, id)) return { public: data, rubric };
  const diagnosis = data.interactions.filter((item) => item.group === 'razonamiento');
  const seen = new Set(diagnosis.map(({ label }) => label.toLowerCase()));
  const existing = new Set(data.interactions.map((item) => item.id));
  const alternatives = diagnosisAlternatives[id]
    .map((label, index) => ({ id: 'diagnostico-extra-' + (index + 1), group: 'razonamiento', label, reply: '' }))
    .filter((item) => !seen.has(item.label.toLowerCase()) && !existing.has(item.id))
    .slice(0, Math.min(Math.max(0, 5 - diagnosis.length), 35 - data.interactions.length));
  if (!alternatives.length) return { public: data, rubric };
  const randomized = shuffle([...diagnosis, ...alternatives]);
  const interactions = [...data.interactions.filter((item) => item.group !== 'razonamiento'), ...randomized];
  const expected = existingDifferentials[id]?.filter((candidate) => diagnosis.some((item) => item.id === candidate))
    ?? alternatives.map(({ id }) => id);
  return {
    public: { ...data, interactions },
    rubric: !rubric.differentials && expected.length === 2
      ? { ...rubric, differentials: expected, differentialNote: differentialNotes[id] } : rubric,
  };
}
