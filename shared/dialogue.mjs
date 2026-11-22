const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export const PATIENT_HISTORY_LIMIT = 6;
export const patientAge = (data) => data.scenario?.match(/\bde (\d+ (?:años?|mes(?:es)?|semanas?|días?))\b/i)?.[1];

const ignored = new Set(['acerca', 'algun', 'alguna', 'antes', 'algo', 'como', 'cuando', 'cuanto', 'desde', 'donde', 'hace',
  'manera', 'nino', 'nina', 'puede', 'podria', 'pregunta', 'sobre', 'tiene', 'usted', 'doctor', 'doctora']);
const timingQuestion = /\b(desde cuando|hace cuanto|cuando (empezo|comenzo|inicio)|desde que (dia|hora)|hace cuantos dias|inicio|duracion)\b/;
const timingFact = /\b(inicio|evolucion|duracion|primero|horas|dias|semanas|ayer|empezo|comenzo)\b/;
const medicationQuestion = /\b(medicamentos?|medicacion|medicinas?|farmacos?|jarabes?|tratamientos?|remedios?|pastillas?|antibioticos?|inhaladores?|insulina|diureticos?|descongestionantes?|hierro|paracetamol|acetaminofen|ibuprofeno|antihistaminicos?)\b/;
const specificMedication = /\b(antibioticos?|inhaladores?|insulina|diureticos?|descongestionantes?|hierro|paracetamol|acetaminofen|ibuprofeno|antihistaminicos?)\b/;
const vaccineQuestion = /\b(vacunas?|vacunad[oa]s?|vacunacion|inmunizacion|esquema vacunal|esquema de vacunas|carn[et]+ de vacunas)\b/;
const vaccineFact = /\b(vacun\w*|inmuniz\w*|esquema|carne|carnet|dosis de refuerzo|registro(?: completo| de vacunacion))\b/;
const allergyQuestion = /\b(alergia|alergico|alergica|alergias)\b/;
const backgroundQuestion = /\b(?:(?:sufre|padece) de algo(?: mas)?|(?:sufre|padece|tiene|ha tenido|le han diagnosticado) (?:de )?alguna enfermedad(?: de base| cronica| previa)?|(?:algun |alguna )antecedentes?(?: (?:personal|medico|patologico)s?)?)(?: doctor| doctora| senor| senora)?$/;
const backgroundFact = /\b(?:antecedentes? (?:personales?|medicos?|patologicos?|renales?|cardiacos?|respiratorios?)|comorbilidades?|enfermedades? (?:cronicas?|previas?|de base))\b/;
const subjects = [
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
  [/\b(dolor|duele|doloroso)\b/, /dolor|duele/],
  [/\b(apnea|pausa|pausas)\b/, /apnea|pausa/],
];
const questionSignal = /\b(que (le |lo |la )?(paso|ocurrio|preocupa|trajo|trae|notaron|noto)|como (empezo|comenzo|esta (el nino|la nina|su hijo|su hija))|cuando (le |lo |la )?(empezo|comenzo|inicio|ocurrio)|desde cuando|hace cuanto|cuanto tiempo|donde le|ha tenido|ha notado|le duele|tiene|ha presentado)\b/;
const openQuestion = /\b(que (?:(?:le|lo|la|les|los|las|te) )?(?:trae|trajo|paso|ocurrio|preocupa)|por que (?:vino|vinieron|viene|vienen|consulto|consultan|(?:lo |la )?(?:trajo|trajeron))|por que motivo|motivo (?:de (?:la )?|por el que )(?:consulta|visita|vino)|razon de (?:la )?(?:consulta|visita)|como (?:empezo|comenzo) todo|cuenteme que paso|que (?:le )?pasa|en que (?:le |te )?puedo (?:ayudarle|ayudar))\b/;
const followUp = /^(?:y )?(?:desde cuando|cuando fue|hace cuanto|cuanto tiempo|luego|despues|que paso despues|que mas|algo mas|me cuenta mas|podria contarme mas|eso|como asi)(?: paso| exactamente)?$/;
const ageQuestion = /\b(que edad tiene|cuantos (?:anos|meses) tiene|cual es (?:la|su) edad)\b/;

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
    || vaccineQuestion.test(text) || medicationQuestion.test(text)
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

const beforeChoice = /^(?:y |los |lo |de |las |del |los de |lo de |las de |que le dieron |que tomaba )*(?:antes|previos?|previamente|habituales)(?: de venir| de la consulta| de que empezara| por favor)?$/;
const currentChoice = /^(?:y |los |lo |de |las |del |los de |lo de |las de )*(?:ahora|hoy|actualmente|actuales)(?: por favor)?$/;
const previousMedication = /\b(antes|previo\w*|previamente|habitual\w*|desde hace|hace (?:pocos |varios |unos |\d+ )?(?:dias|semanas)|recibio|habia recibido|inici[oó]|uso|tomaba|dieron|extraccion)\b/;
const currentMedication = /\b(hoy|ahora|actualmente|esta (?:tomando|recibiendo|usando)|toma|usa|recibe|administra)\b/;

function topicClauses(currentCase, source, linkedSource = source) {
  return [{ label: '', reply: currentCase.opening }, ...currentCase.interactions.filter((item) => item.group === 'anamnesis')]
    .flatMap(({ label, reply }) => (reply ?? '').split(/;\s*|(?<=[.!?])\s+|,\s+|\s+y\s+/)
      .map((part) => part.trim()).filter((part) => {
        const value = normalize(part);
        return source.test(value) || (source.test(normalize(label)) && linkedSource.test(value));
      }));
}

function asSentence(text) {
  const phrase = text.trim().replace(/[;,]+$/, '');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + (/[.!?]$/.test(phrase) ? '' : '.');
}

function recentMedicationTopic(history) {
  for (const turn of [...history].reverse()) {
    const text = normalize(turn.question);
    if (allergyQuestion.test(text) || vaccineQuestion.test(text)) return '';
    if (medicationQuestion.test(text)) return text;
    if (!socialReply(turn.question) && !beforeChoice.test(text) && !currentChoice.test(text) && !followUp.test(text)) return '';
  }
  return '';
}

export function patientHistoryReply(currentCase, question, history = []) {
  const text = normalize(question);
  if (allergyQuestion.test(text)) return null;
  if (vaccineQuestion.test(text)) {
    const evidence = topicClauses(currentCase, /\b(vacun\w*|inmuniz\w*)\b/, vaccineFact);
    const vaccine = text.match(/\b(?:contra|de la vacuna de) (?:el |la )?([a-z0-9]+)/)?.[1];
    const relevant = evidence.find((source) => !vaccine || normalize(source).includes(vaccine));
    const relevantText = normalize(relevant ?? '');
    let reply = relevant ? asSentence(relevant) : vaccine
      ? 'No recuerdo si recibió esa vacuna en particular. Tendría que revisar el carné.'
      : 'No estoy seguro de si tiene todas las vacunas al día. Tendría que revisar el carné.';
    if (!vaccine && /^(?:vacunacion|esquema) incomplet[oa]$/.test(relevantText)) reply = 'Le faltan algunas vacunas.';
    if (!vaccine && /^(?:vacunacion|esquema) al dia$/.test(relevantText)) reply = 'Sí, tiene las vacunas al día.';
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

export function structured(currentCase, question, history = []) {
  const background = patientBackgroundReply(currentCase, question);
  if (background) return background;
  const socialTurn = social(question);
  if (socialTurn.only) return socialTurn.only;
  const patientHistory = patientHistoryReply(currentCase, question, history);
  if (patientHistory) return patientHistory;
  const text = normalize(question);
  const facts = currentCase.interactions.filter((item) => item.group === 'anamnesis' && item.reply);
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
  if (!reply && allergyQuestion.test(text)) reply = 'No sabría confirmarle si tiene alguna alergia. ¿Se refiere a algún medicamento o alimento en particular?';
  reply ||= 'No recuerdo bien ese detalle.';
  return [socialTurn.prefix, reply].filter(Boolean).join(' ');
}
