export const EXAM_AREAS = {
  vitals: 'Signos vitales',
  respiratory: 'Respiratorio',
  cardiovascular: 'Cardiovascular y perfusión',
  abdomen: 'Abdomen e hidratación',
  neurological: 'Neurológico',
  skin: 'Piel y mucosas',
  other: 'Otros hallazgos',
};

const patterns = {
  vitals: /signos vitales|frecuencia|presion arterial|temperatura|saturacion|oxigenacion|constantes|antropometria/,
  respiratory: /respir|ventil|pulmon|via aerea|estridor|tiraje|sibilan|auscultacion pulmonar|ruidos respiratorios|taquipnea/,
  cardiovascular: /cardiac|cardiovasc|corazon|perfusion|pulso|soplo|llenado capilar|precordio/,
  abdomen: /abdom|hepat|esplen|hidrat|tolerancia oral|diuresis|deposicion|higado|sangrado digestivo/,
  neurological: /neurolog|conciencia|estado mental|focalidad|meninge|reflejo|tono muscular|alerta|glasgow|pupila/,
  skin: /piel|mucosa|exantema|erupcion|petequia|lesion cutanea|coloracion|dermat|placas/,
};

export function examAreas(label) {
  const text = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const areas = Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([area]) => area);
  return areas.length ? areas : ['other'];
}
