const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const PATIENT_HISTORY_LIMIT = 6;
export const patientAge = (data) => data.scenario?.match(/\bde (\d+ (?:años?|mes(?:es)?|semanas?|días?))\b/i)?.[1];

const ignored = new Set(['acerca', 'algun', 'alguna', 'antes', 'algo', 'como', 'cuando', 'cuanto', 'desde', 'donde', 'hace',
  'manera', 'nino', 'nina', 'puede', 'podria', 'pregunta', 'sobre', 'tiene', 'usted', 'doctor', 'doctora']);
const timingQuestion = /\b(desde cuando|hace cuanto|cuando (empezo|comenzo|inicio)|desde que (dia|hora)|hace cuantos dias|inicio|duracion)\b/;
const timingFact = /\b(inicio|evolucion|duracion|primero|horas|dias|semanas|ayer|empezo|comenzo)\b/;
const medicationQuestion = /\b(medicamentos?|medicamenots?|medicacion|medicinas?|farmacos?|jarabes?|tratamientos?|remedios?|pastillas?|antibioticos?|inhaladores?|insulina|diureticos?|descongestionantes?|hierro|paracetamol|acetaminofen|ibuprofeno|antihistaminicos?)\b/;
const specificMedication = /\b(antibioticos?|inhaladores?|insulina|diureticos?|descongestionantes?|hierro|paracetamol|acetaminofen|ibuprofeno|antihistaminicos?)\b/;
const vaccineQuestion = /\b(vacunas?|vacunad[oa]s?|vacunacion|inmunizacion|esquema vacunal|esquema de vacunas|dosis de refuerzo)\b/;
const cardQuestion = /\b(?:carnet?|cartilla|registro|tarjeta) (?:de |vacunal|de la )?(?:vacun\w*|inmuniz\w*)\b|\bcarnet?\b/;
const vaccineFact = /\b(vacun\w*|inmuniz\w*|esquema|carne|carnet|dosis de refuerzo|registro(?: completo| de vacunacion))\b/;
const insuranceQuestion = /\b(eps|e p s|entidad promotora de salud|aseguradora|seguro (?:medico|de salud)|afiliaci[oó]n (?:a|en) salud|afiliad[oa]s? (?:a|al|en)|regimen (?:contributivo|subsidiado))\b/;
const insuranceFact = /\b(eps|e p s|entidad promotora de salud|aseguradora|seguro (?:medico|de salud)|afiliaci[oó]n|afiliad[oa]s?|regimen (?:contributivo|subsidiado))\b/;
const allergyQuestion = /\b(alergia|alergico|alergica|alergias)\b/;
const backgroundQuestion = /\b(?:(?:sufre|padece) de algo(?: mas)?|(?:sufre|padece|tiene|ha tenido|le han diagnosticado) (?:de )?alguna enfermedad(?: de base| cronica| previa)?|(?:algun |alguna )antecedentes?(?: (?:personal|medico|patologico)s?)?)(?: doctor| doctora| senor| senora)?$/;
const backgroundFact = /\b(?:antecedentes? (?:personales?|medicos?|patologicos?|renales?|cardiacos?|respiratorios?)|comorbilidades?|enfermedades? (?:cronicas?|previas?|de base))\b/;
const rash = /\b(?:exantema|sarpullido|ronchas?|lesiones?|manchas?|erupcion|granitos?|vesiculas?|costras?)\b/;
const nodes = /\b(?:adenopatias?|ganglios?|bultos?|bolitas?)\b/;
const visibleSymptoms = [rash, nodes];
const subjects = [
  [/\b(?:cefalea|dolor de cabeza|duele la cabeza)\b/, /\b(?:cefalea|dolor de cabeza|duele la cabeza)\b/],
  [/\b(?:dolor (?:de|en la) barriga|dolor abdominal|dolor de estomago|duele (?:la barriga|el estomago|el abdomen))\b/, /\b(?:dolor abdominal|dolor de (?:barriga|estomago)|duele (?:la barriga|el estomago|el abdomen))\b/],
  [/\b(?:dolor (?:de|en el) pecho|dolor toracico|duele el pecho)\b/, /\b(?:dolor (?:de|en el) pecho|dolor toracico|duele el pecho)\b/],
  [/\b(?:duele (?:el oido|la oreja)|dolor (?:de oido|en el oido)|otalgia)\b/, /\b(?:duele (?:el oido|la oreja)|dolor (?:de oido|en el oido)|otalgia)\b/],
  [/\b(?:dolor (?:al|para) orinar|arde al orinar|disuria)\b/, /\b(?:dolor (?:al|para) orinar|arde al orinar|disuria)\b/],
  [/\b(fiebre|temperatura|caliente)\b/, /\b(fiebre|temperatura|caliente|febril)\b/],
  [/\b(tos|tose|toser|tosiendo)\b/, /\b(tos|tose|toser|tosiendo)\b/],
  [/\b(respirar|respira|respiracion|agita|ahoga|falta de aire)\b/, /respirat|respira|tiraje|disnea|ahoga|agita/],
  [/\b(comer|come|beber|bebe|tomas?|tomando|alimentacion|leche|pecho)\b/, /alimenta|tolerancia|ingesta|tomas?|bebe|leche|pecho|sorbos/],
  [/\b(orina|orinar|pip[ií]|panales?|miccion)\b/, /orin|diuresis|panal|panales|miccion/],
  [/\b(vomito|vomita|vomitar|emesis)\b/, /vomit|emesis/],
  [/\b(diarrea|deposiciones?|evacua|popo|heces)\b/, /diarrea|deposicion|evacu|heces/],
  [medicationQuestion, medicationQuestion],
  [allergyQuestion, /alerg/],
  [vaccineQuestion, vaccineFact],
  [insuranceQuestion, insuranceFact],
  [rash, /\b(?:brote|exantema|sarpullido|ronchas?|lesiones?|manchas?|erupcion|granitos?|vesiculas?|costras?)\b/],
  [nodes, /\b(?:adenopatias?|ganglios?|bultos?|bolitas?|adenomegalias?)\b/],
  [/\b(edema|hincha|hinchazon|inflamacion)\b/, /edema|hincha|inflam/],
  [/\b(palidez|palid[oa]s?)\b/, /palidez|palid/],
  [/\b(sangra|sangrado|sangre|hemorragia)\b/, /sangr|hemorrag/],
  [/\b(convulsiones?|crisis|sacudidas?)\b/, /convuls|crisis|sacud/],
  [/\b(dolor|duele|doloroso)\b/, /dolor|duele/],
  [/\b(apnea|pausa|pausas)\b/, /apnea|pausa/],
  [/\b(?:moquea|mocos?|rinorrea|congestion nasal|nariz tapada)\b/, /\b(?:mocos?|rinorrea|congestion nasal|nariz tapada)\b/],
  [/\b(?:mareos?|vertigo|marea|mareado)\b/, /\b(?:mareo\w*|vertigo|marea\w*)\b/],
  [/\b(?:desmayos?|desmayo|sincope|perdio el conocimiento)\b/, /\b(?:desmay\w*|sincope|perdio el conocimiento)\b/],
  [/\b(?:cansancio|fatiga|decaimient\w*|decaid\w*|somnolien\w*|somnolenci\w*)\b/, /\b(?:cans\w*|fatiga|decaimient\w*|decaid\w*|somnol\w*)\b/],
  [/\b(?:bajo de peso|ha perdido peso|perdida (?:de|del) peso|adelgaz\w*)\b/, /\b(?:bajo de peso|perd\w* (?:de )?peso|adelgaz\w*)\b/],
];
const questionSignal = /\b(que (le |lo |la )?(paso|ocurrio|preocupa|trajo|trae|notaron|noto)|como (empezo|comenzo|esta (el nino|la nina|su hijo|su hija))|cuando (le |lo |la )?(empezo|comenzo|inicio|ocurrio)|desde cuando|hace cuanto|cuanto tiempo|donde le|ha tenido|ha notado|le duele|tiene|ha presentado)\b/;
const openQuestion = /\b(que (?:(?:le|lo|la|les|los|las|te) )?(?:trae|trajo|paso|ocurrio|preocupa)|por que (?:vino|vinieron|viene|vienen|consulto|consultan|(?:lo |la )?(?:trajo|trajeron))|por que motivo|motivo (?:de (?:la )?|por el que )(?:consulta|visita|vino)|razon de (?:la )?(?:consulta|visita)|como (?:empezo|comenzo) todo|cuenteme que paso|que (?:le )?pasa|en que (?:le |te )?puedo (?:ayudarle|ayudar))\b/;
const followUp = /^(?:y )?(?:desde cuando|cuando fue|hace cuanto|cuanto tiempo|luego|despues|que paso despues|que mas|algo mas|me cuenta mas|podria contarme mas|eso|como asi)(?: paso| exactamente)?$/;
const ageQuestion = /\b(que edad tiene|cuantos (?:anos|meses) tiene|cual es (?:la|su) edad)\b/;
const outOfRole = /\b(?:no (?:tengo|cuento con|dispongo de) (?:ese|el|este) dato|no recuerdo bien ese detalle|pregunt\w* de otra (?:forma|manera)|reformul\w* (?:la|su|tu) pregunta|(?:no se (?:han )?)?(?:detect\w*|identific\w*|observ\w*) (?:de )?(?:comportamientos? inadecuados?|contenido (?:inadecuado|inapropiado|ofensivo)))\b/;
const detailFacets = [
  [/\b(?:en que (?:parte|lado|zona|lugar)|donde|ubicacion|localizacion|distribucion|se extendio|se riega|se propag)\w*\b/, /\b(?:cabeza|cara|mejillas?|cuello|cervical\w*|axila\w*|inguinal\w*|ingle\w*|occipital\w*|retroauricular\w*|detras de (?:las? )?orejas?|parpado|piel|tronco|brazos?|manos?|piernas?|pies?|abdomen|pecho|costado|alrededor|dispers\w*|generalizad\w*)\b/,
    'No sabría señalarle en qué parte exactamente.'],
  [timingQuestion, /\b(?:ayer|anoche|hace \w+|\d+ (?:dias|horas|semanas)|desde|inicio brusco|de golpe|al despertar)\b/,
    'No recuerdo cuándo empezó exactamente.'],
  [/\b(?:como ha (?:cambiado|seguido)|ha (?:empeorado|mejorado|cambiado)|evolucion|ha vuelto|siguen? (?:saliendo|apareciendo)|que paso despues|se (?:quito|fue))\b/, /\b(?:desaparec\w*|siguen? (?:saliendo|apareciendo)|vuelve\w*|mejor\w*|peor|empeor\w*|persist\w*|recurr\w*|nuev\w*)\b/,
    'No he podido precisar cómo ha cambiado.'],
  [/\b(?:que tan (?:fuerte|intenso)|cuanto (?:le )?duele|intensidad|que (?:lo |le )?(?:empeora|alivia|mejora)|con que (?:empeora|mejora))\b/, /\b(?:mucho|leve|fuerte|intens\w*|posicional|al acostar\w*|al mover\w*|al respirar|alivi\w*|empeor\w*|lo despierta)\b/,
    'No sabría decirle qué tanto le molesta o qué lo cambia.'],
  [/\b(?:como (?:es|son|era|eran|se ve|se ven|se siente|se sienten)|describ\w*|aspecto|color|forma|tamano|morfologia|pica|rasca|prurito)\b/,
    /\b(?:roj\w*|rosad\w*|palid\w*|oscur\w*|ampoll\w*|vesicul\w*|erosion\w*|costra\w*|tenue\w*|agrupad\w*|elevad\w*|plan\w*|pic\w*|prurito|doloros\w*|irrit\w*|seca|humeda|espes\w*|verdos\w*|dolor punzante|bultos? (?:duros?|blandos?))\b/,
    'No me fijé bien en ese detalle.'],
];
const associatedQuestion = /\b(?:(?:algun(?:os)? |alguna(?:s)? )?otr[oa]s? (?:sintomas?|molestias?)|(?:que|algo) mas (?:ha (?:notado|tenido)|le pasa|le duele|le molesta)|que sintomas? (?:mas|aparte))\b/;
const systemsQuestion = /\b(?:revision por sistemas|interrogatorio por sistemas|sintomas? (?:en|por) otros sistemas)\b/;
const symptomQuestion = /\b(?:ha tenido|ha presentado|lo ha visto|ha notado|dijo que tiene|tiene|tenia|presenta|siente|le ha dado|le dio|le da|le cuesta|ha estado)\b/;
const backgroundDetails = [
  [/\b(?:antecedentes? familiares?|historia familiar|en la familia|familiares?|alguien de su familia)\b/, /\b(?:familia\w*|hereditar\w*|madre|padre|mama|papa|herman\w*|abuel\w*)\b/, 'No sabría confirmarle si hay antecedentes en la familia.'],
  [/\b(?:hospitaliz\w*|internad\w*|ingresos? previos?)\b/, /\b(?:hospitaliz\w*|internad\w*|ingresos? previos?)\b/, 'No recuerdo una hospitalización anterior que pueda contarle.'],
  [/\b(?:cirug\w*|operaron|operad\w*|intervenciones quirurgicas)\b/, /\b(?:cirug\w*|operaron|operad\w*|quirurgic\w*)\b/, 'No recuerdo una operación anterior que pueda contarle.'],
  [/\b(?:como nacio|nacio antes|nacio a termino|prematur\w*|embarazo|parto|cesarea|neonatal|perinatal)\b/, /\b(?:nacio|prematur\w*|embarazo|parto|cesarea|perinatal|neonatal|gestacion|termino)\b/, 'No recuerdo esos detalles del embarazo o del nacimiento.'],
  [/\b(?:contactos?|alguien enfermo|estuvo con alguien|viajes?|ha viajado|recien viajo|exposicion)\b/, /\b(?:contact\w*|exposic\w*|viaj\w*|cerca de|escuela|colegio|enfermo|estuvo con)\b/, 'No sabría decirle con quién pudo haber estado en contacto.'],
];
const routineQuestion = /\b(?:deportes?|actividad fisica|ejercicio|juega|jugar)\b/;
const currentRoutine = /\b(?:ahora|hoy|desde|cuando|despues|durante|cansa|fatiga|ahoga|deja|dejo|par[oó]|dolor|duele|tolera|resiste|participa menos)\b/;
const symptomFacts = subjects.filter(([question]) => ![medicationQuestion, allergyQuestion, vaccineQuestion, insuranceQuestion].includes(question));

function findFact(items, text) {
  const words = [...new Set(text.match(/[a-z]{4,}/g) ?? [])].filter((word) => !ignored.has(word));
  const topics = subjects.filter(([question]) => question.test(text));
  const requiredTopic = topics.find(([question]) => question === allergyQuestion || question === medicationQuestion)?.[1];
  const asksWhen = timingQuestion.test(text);
  let best;
  let highest = 0;
  for (const item of items) {
    const label = normalize(item.label);
    const reply = normalize(item.reply);
    if (requiredTopic && !requiredTopic.test(label) && !requiredTopic.test(reply)) continue;
    const named = words.filter((word) => label.includes(word)).length;
    const supported = words.filter((word) => reply.includes(word)).length;
    const indexedTopics = topics.filter(([, pattern]) => pattern.test(label)).length;
    const statedTopics = topics.filter(([, pattern]) => pattern.test(reply)).length;
    if (topics.length && indexedTopics + statedTopics === 0) continue;
    const timeScore = asksWhen ? (timingFact.test(label) ? 5 : timingFact.test(reply) ? 3 : 0) : 0;
    const score = named * 6 + supported * 2 + indexedTopics * 5 + statedTopics * 3 + timeScore;
    if (score > highest) {
      highest = score;
      best = item;
    }
  }
  return best;
}

function social(question) {
  const text = normalize(question);
  const permission = /\b(?:puedo|podria|me permite|permite que|esta bien si|le parece si|te parece si)\s+(?:(?:le|lo|la|me) )?(?:(?:haga|hacerle|hacer) (?:unas? |algunas? )?preguntas?|pregunt\w*|hablar|entrevist\w*|examin\w*|explor\w*|revis\w*|auscult\w*|tomar (?:la )?(?:temperatura|presion))\b/.test(text);
  const asksName = /\b(?:como se llama usted|como te llamas|cual es (?:su|tu) nombre|con quien (?:hablo|tengo el gusto)|quien (?:es usted|eres)|que parentesco)\b/.test(text);
  const checksIn = /\bcomo est(?:a|as)(?: usted)?$/.test(text);
  const clinical = questionSignal.test(text) || openQuestion.test(text) || backgroundQuestion.test(text)
    || vaccineQuestion.test(text) || cardQuestion.test(text) || medicationQuestion.test(text) || insuranceQuestion.test(text)
    || associatedQuestion.test(text) || systemsQuestion.test(text) || symptomQuestion.test(text) || routineQuestion.test(text)
    || backgroundDetails.some(([question]) => question.test(text)) || detailFacets.some(([question]) => question.test(text))
    || (question.includes('?') && !permission && !asksName && !checksIn);
  if (asksName && !clinical) {
    return { only: 'Soy la persona que acompaña al paciente. Puede hablar conmigo.', prefix: '' };
  }
  const introduction = /\b(?:me llamo|mi nombre es|me presento|soy (?:(?:el|la|un|una|su) )?(?:doctor\w*|medic\w*|estudiante)|voy a (?:atender|acompanar|hacerle unas preguntas))\b/.test(text);
  const greeting = /(?:^|\b)(?:hola|buen dia|buenos dias|buenas tardes|buenas noches|buenas)(?:\b|$)/.test(text);
  const exam = /\b(examin\w*|explor\w*|revis\w*|auscult\w*|tomar (?:la )?(?:temperatura|presion))\b/.test(text);
  const empathy = /\b(?:lamento|siento (?:mucho|que)|entiendo (?:su|tu|que|lo)|se que (?:esto|es)|tomese su tiempo|tranquil[oa])\b/.test(text);
  const thanks = /\b(?:muchas gracias|gracias por|gracias)\b/.test(text);
  const closing = /\b(?:hasta luego|adios|que tenga buen dia|me despido)\b/.test(text);
  const greetingLine = introduction ? 'Mucho gusto.' : greeting ? 'Hola, gracias por atendernos.' : '';
  const permissionLine = permission ? (exam ? 'Sí, puede revisarlo. Dígame qué va a hacer.' : 'Sí, claro. Puede preguntarme.') : '';
  const acknowledgment = [greetingLine, permissionLine].filter(Boolean).join(' ');
  if (clinical) return { only: '', prefix: acknowledgment };
  if (closing) return { only: 'Gracias por escucharnos y por explicarme lo que sigue.', prefix: '' };
  if (permission) return { only: acknowledgment, prefix: '' };
  if (introduction) return { only: 'Mucho gusto. Gracias por atendernos, estoy aquí para contarle lo que ha pasado.', prefix: '' };
  if (checksIn) return { only: 'Gracias por preguntar. Estoy aquí para contarle lo que le ha pasado.', prefix: '' };
  if (greeting) return { only: greetingLine, prefix: '' };
  if (empathy) return { only: 'Gracias por escucharme. Me ayuda poder contarle lo que ha pasado.', prefix: '' };
  if (thanks) return { only: 'Con mucho gusto. Si necesita preguntarme algo más, aquí estoy.', prefix: '' };
  return { only: '', prefix: '' };
}

export function socialReply(question) { return social(question).only || null; }

export function patientBackgroundReply(currentCase, question) {
  if (!backgroundQuestion.test(normalize(question))) return null;
  const fact = currentCase.interactions.find(({ group, label, reply }) => group === 'anamnesis' && reply
    && (backgroundFact.test(normalize(label)) || backgroundFact.test(normalize(reply))));
  const reply = fact?.reply ?? 'No que yo sepa. ¿Se refiere a alguna enfermedad en particular?';
  return [social(question).prefix, reply].filter(Boolean).join(' ');
}

const beforeChoice = /^(?:y |por |los |lo |de |las |del |los de |lo de |las de |que le dieron |que tomaba )*(?:antes|previos?|previamente|habituales)(?: de venir| de la consulta| de que empezara| por favor)?$/;
const currentChoice = /^(?:y |por |los |lo |de |las |del |los de |lo de |las de )*(?:ahora|hoy|actualmente|actuales)(?: por favor)?$/;
const previousMedication = /\b(antes|previo\w*|previamente|habitual\w*|desde hace|hace (?:pocos |varios |unos |\d+ )?(?:dias|semanas)|recibio|habia recibido|inici[oó]|uso|tomaba|dieron|extraccion)\b/;
const currentMedication = /\b(hoy|ahora|actualmente|esta (?:tomando|recibiendo|usando)|toma|usa|recibe|administra)\b/;

function interviewFacts(currentCase) {
  return [...(currentCase.interview ?? []).map(({ question, reply }) => ({ label: question, reply })),
    ...currentCase.interactions.filter((item) => item.group === 'anamnesis' && item.reply)];
}

function topicClauses(currentCase, source, linkedSource = source, extra = [], acceptsLabel = (label) => source.test(label)) {
  return [{ label: '', reply: currentCase.opening }, ...interviewFacts(currentCase), ...extra]
    .flatMap(({ label, reply }) => (reply ?? '').split(/;\s*|(?<=[.!?])\s+|,\s+(?!(?:cerca de|alrededor de|detrás de|en (?:el|la|los|las))\b)|\s+y\s+/i)
      .map((part) => part.trim()).filter((part) => {
        const value = normalize(part);
        return source.test(value) || (linkedSource.test(value) && acceptsLabel(normalize(label), value));
      }));
}

function asSentence(text) {
  const phrase = text.trim().replace(/[;,]+$/, '');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + (/[.!?]$/.test(phrase) ? '' : '.');
}

function recentMedicationTopic(history) {
  for (const turn of [...history].reverse()) {
    const text = normalize(turn.question);
    if (allergyQuestion.test(text) || vaccineQuestion.test(text) || cardQuestion.test(text) || insuranceQuestion.test(text)) return '';
    if (medicationQuestion.test(text)) return text;
    if (!socialReply(turn.question) && !beforeChoice.test(text) && !currentChoice.test(text) && !followUp.test(text)) return '';
  }
  return '';
}

function vaccineEvidence(currentCase) {
  return topicClauses(currentCase, /\b(vacun\w*|inmuniz\w*)\b/, vaccineFact).filter((part) =>
    /\b(?:registr\w*|document\w*|pendient\w*|sin vacunar|no vacun\w*|al dia|incomplet\w*|complet\w*|falt\w*|recib\w*|puso|pusieron|tiene|dosis|esquema|refuerzo)\b/.test(normalize(part)));
}

export function vaccinationCard(currentCase) {
  if (currentCase.vaccinationCard) return currentCase.vaccinationCard;
  const first = vaccineEvidence(currentCase)[0];
  if (!first || /\b(?:no (?:esta |ha sido |fue )?documentad\w*|sin (?:registro|documentacion)|no sabemos)\b/.test(normalize(first))) return null;
  return { summary: vaccineStatus(first), doses: [] };
}

function vaccineStatus(value) {
  if (/^(?:vacunacion|esquema) incomplet[oa]$/.test(normalize(value))) return 'Le faltan algunas vacunas.';
  if (/^(?:vacunacion|esquema) al dia$/.test(normalize(value))) return 'Sí, tiene las vacunas al día.';
  return asSentence(value);
}

export function isVaccinationCardRequest(question) { return cardQuestion.test(normalize(question)); }

export function patientHistoryReply(currentCase, question, history = []) {
  const text = normalize(question);
  if (allergyQuestion.test(text)) {
    const source = topicClauses(currentCase, /\b(?:alerg\w*|reaccion alergica)\b/)[0];
    const reply = source ? asSentence(source) : 'No sabría confirmarle si tiene alguna alergia. ¿Se refiere a algún medicamento o alimento en particular?';
    return [social(question).prefix, reply].filter(Boolean).join(' ');
  }
  if (cardQuestion.test(text)) {
    const card = vaccinationCard(currentCase);
    const reply = !card ? 'No traje el carné para mostrarle en esta consulta.'
      : card.doses.length ? 'Sí, aquí está el carné de vacunación.'
        : 'Le muestro el resumen de vacunación que tengo a mano.';
    return [social(question).prefix, reply].filter(Boolean).join(' ');
  }
  if (vaccineQuestion.test(text)) {
    const evidence = [currentCase.vaccinationCard?.summary, ...vaccineEvidence(currentCase)].filter(Boolean);
    const vaccine = text.match(/\b(?:contra|vacuna (?:de|del)) (?:el |la )?([a-z0-9]+)/)?.[1];
    const registeredVaccine = vaccine && currentCase.vaccinationCard?.doses.find(({ vaccine: name }) => normalize(name).includes(vaccine));
    const relevant = evidence.find((source) => !vaccine || normalize(source).includes(vaccine));
    const reply = registeredVaccine ? `Sí, en el carné aparece ${registeredVaccine.vaccine}.` : relevant ? vaccineStatus(relevant) : vaccine
      ? 'No recuerdo si recibió esa vacuna en particular. Tendría que revisar el carné.'
      : currentCase.vaccinationCard?.doses.length ? 'Sí, hay varias dosis anotadas en el carné. Puede revisarlas.'
        : 'No estoy seguro de si tiene todas las vacunas al día. Tendría que revisar el carné.';
    return [social(question).prefix, reply].filter(Boolean).join(' ');
  }
  if (insuranceQuestion.test(text)) {
    const evidence = topicClauses(currentCase, insuranceFact);
    const named = currentCase.interactions.find(({ group, label, reply }) => group === 'anamnesis' && reply
      && /^(?:nombre (?:de |de la )?)?(?:eps|e p s|aseguradora)$/.test(normalize(label)));
    const reply = evidence.length ? asSentence(evidence[0])
      : named ? asSentence(named.reply) : 'Tendría que revisar los documentos para confirmarle lo de la EPS.';
    return [social(question).prefix, reply].filter(Boolean).join(' ');
  }

  const topic = medicationQuestion.test(text) ? text
    : beforeChoice.test(text) || currentChoice.test(text) ? recentMedicationTopic(history) : '';
  if (!topic) return null;
  const medication = topic.match(specificMedication)?.[0]?.replace(/(?:res|s)$/, (suffix) => suffix === 'res' ? 'r' : '');
  const prior = priorMedicationQuestion(text);
  const recent = currentChoice.test(text) || /\b(ahora|hoy|actualmente|para esto|este episodio)\b/.test(text);
  const snippets = topicClauses(currentCase, medicationQuestion);
  const eligible = snippets.filter((item) => {
    const fact = normalize(item);
    if (medication && !fact.includes(medication)) return false;
    if (prior) return previousMedication.test(fact) || !currentMedication.test(fact);
    if (recent) return currentMedication.test(fact) && !/\bantes de (?:este|esta|que|venir)\b/.test(fact);
    return true;
  });
  const reply = eligible.length ? eligible.slice(0, 2).map(asSentence).join(' ')
    : medication ? 'No recuerdo si tomó ese medicamento.'
      : prior ? 'No recuerdo si le dieron algún medicamento antes de venir.'
        : recent ? 'No sé si recibió algún medicamento para este episodio.'
          : '¿Me pregunta por lo que tomaba antes o por lo que le dieron hoy?';
  return [social(question).prefix, reply].filter(Boolean).join(' ');
}

function priorMedicationQuestion(text) {
  return beforeChoice.test(text) || /\b(antes|previamente|previos?|habitualmente|habituales)\b/.test(text);
}

function symptomTopic(text) {
  const topic = symptomFacts.find(([question]) => question.test(text));
  if (topic) return topic;
  if (/\bbrote\b/.test(text)) return symptomFacts.find(([question]) => question === rash);
}

function latestSymptom(history, opening) {
  for (const turn of [...history].reverse()) {
    const text = normalize(turn.question);
    const topic = symptomTopic(text);
    if (topic) return topic;
    if (openQuestion.test(text)) return symptomTopic(normalize(opening));
    if (!socialReply(turn.question) && !detailFacets.some(([question]) => question.test(text))) break;
  }
}

export function focusedHistoryReply(currentCase, question, history = [], allowUncertain = true) {
  const text = normalize(question);
  const configured = (currentCase.interview ?? []).map((item) => ({ label: item.question, reply: item.reply }));
  const facet = detailFacets.find(([pattern]) => pattern.test(text));
  const explicitTopic = symptomTopic(text);
  const topic = explicitTopic ?? (facet ? latestSymptom(history, currentCase.opening) : undefined);
  const target = configured.find(({ label }) => {
    const key = normalize(label);
    return key === text || (facet && topic && facet[0].test(key) && topic[0].test(key));
  });
  const respond = (reply) => [social(question).prefix, reply].filter(Boolean).join(' ');
  if (target) return respond(target.reply);
  if (associatedQuestion.test(text) || systemsQuestion.test(text)) {
    const known = new Set(symptomFacts.filter(([, fact]) => fact.test(normalize(currentCase.opening))
      || history.some((turn) => (turn.reply && fact.test(normalize(turn.reply))) || fact.test(normalize(turn.question)))));
    const candidate = symptomFacts.filter((item) => !known.has(item)).flatMap(([, fact]) => topicClauses(currentCase, fact))
      .find((part) => {
        const value = normalize(part);
        return !/^(?:sin|no|neg\w*|niega)\b/.test(value) && !medicationQuestion.test(value)
          && !backgroundDetails[0][1].test(value);
      });
    return respond(candidate ? asSentence(candidate) : 'Por ahora, eso es lo que más me preocupa.');
  }
  const prior = backgroundDetails.find(([pattern]) => pattern.test(text));
  if (prior) {
    const [, fact, fallback] = prior;
    const source = topicClauses(currentCase, fact)[0];
    if (source || allowUncertain) return respond(source ? asSentence(source) : fallback);
  }
  if (routineQuestion.test(text)) {
    const activity = topicClauses(currentCase, /\b(?:deporte\w*|ejercicio|jueg\w*|jug(?:ar|aba\w*|ando)|actividad fisica|entren\w*)\b/)[0];
    if (activity) return respond(asSentence(activity));
    const relevant = /\b(?:discapacidad|limitacion funcional|retraso motor|esfuerzo|ejercicio|deporte\w*|sedent\w*|rehabilitacion|desmayo|sincope|trauma\w*|esguince)\b/;
    if (!currentRoutine.test(text) && !relevant.test(normalize([currentCase.title, currentCase.scenario, currentCase.opening,
      ...interviewFacts(currentCase).map(({ reply }) => reply)].filter(Boolean).join(' ')))) {
      return respond('Cuando se siente bien, suele jugar en casa.');
    }
  }
  if (!facet) {
    if (!explicitTopic || !symptomQuestion.test(text)) return null;
    const source = topicClauses(currentCase, explicitTopic[1])[0];
    if (source) return respond(asSentence(source));
    return allowUncertain ? respond('No sabría confirmarle si le ha pasado eso.') : null;
  }
  const [, describes, fallback] = facet;
  const observed = topic && visibleSymptoms.includes(topic[0]) ? currentCase.interactions.filter(({ group }) => group === 'exploracion') : [];
  const matches = topic ? topicClauses(currentCase, topic[1], describes, observed, (label, part) =>
    topic[1].test(label) && !symptomFacts.some((other) => other !== topic && other[1].test(label))
      && !visibleSymptoms.some((other) => other !== topic[0] && other.test(part)))
    .filter((part) => describes.test(normalize(part))) : [];
  const asksFirstLocation = facet === detailFacets[0] && /\b(?:empez|comenz|inicio|primero)/.test(text);
  const supported = asksFirstLocation ? matches.find((part) => /\b(?:empez\w*|comenz\w*|primero|inicio)\b/.test(normalize(part))) : matches[0];
  if (supported) return respond(asSentence(supported));
  if (explicitTopic && allowUncertain) return respond(fallback);
  return null;
}

export function patientReplyFits(currentCase, question, reply, history = []) {
  const answer = normalize(reply);
  if (outOfRole.test(answer)) return false;
  const text = normalize(question);
  if (openQuestion.test(text) || followUp.test(text)) return true;
  const topics = subjects.filter(([pattern]) => pattern.test(text));
  if (answer === normalize(currentCase.opening) && !topics.some(([, fact]) => fact.test(answer))) return false;
  const repeated = [...history].reverse().find((turn) => turn.reply && normalize(turn.reply) === answer);
  if (!repeated) return true;
  const previous = normalize(repeated.question);
  return previous === text || topics.some(([pattern, fact]) => pattern.test(previous) && fact.test(answer));
}

export function structured(currentCase, question, history = []) {
  const background = patientBackgroundReply(currentCase, question);
  if (background) return background;
  const socialTurn = social(question);
  if (socialTurn.only) return socialTurn.only;
  const patientHistory = patientHistoryReply(currentCase, question, history);
  if (patientHistory) return patientHistory;
  const focused = focusedHistoryReply(currentCase, question, history);
  if (focused) return focused;
  const text = normalize(question);
  const facts = interviewFacts(currentCase);
  let reply;
  if (followUp.test(text)) {
    // Social turns and earlier follow-ups can intervene between a topic and the next clinical question.
    for (const turn of [...history].reverse()) {
      if (socialReply(turn.question) || followUp.test(normalize(turn.question))) continue;
      if (openQuestion.test(normalize(turn.question))) {
        reply = findFact(facts, text)?.reply || facts[0]?.reply;
      } else {
        reply = findFact(facts, normalize(turn.question + ' ' + question))?.reply;
      }
      break;
    }
  }
  if (!reply && openQuestion.test(text)) reply = currentCase.opening;
  const age = ageQuestion.test(text) ? patientAge(currentCase) : undefined;
  if (!reply && age) reply = `Tiene ${age}.`;
  reply ||= findFact(facts, text)?.reply;
  if (reply && !patientReplyFits(currentCase, question, reply, history)) reply = undefined;
  reply ||= 'No sabría precisarlo. Le puedo contar lo que sí he observado.';
  return [socialTurn.prefix, reply].filter(Boolean).join(' ');
}
