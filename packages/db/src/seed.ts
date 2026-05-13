import { PrismaClient } from "./generated/prisma/client.js";

const prisma = new PrismaClient();

const topics = [
  // ── A1 ──────────────────────────────────────────────────────────
  {
    title: "La mia famiglia",
    description:
      "Parlami della tua famiglia. Quante persone siete? Hai fratelli o sorelle? Dove abita la tua famiglia? Cosa fate insieme di solito?",
    level: "A1",
    category: "DailyLife",
  },
  {
    title: "Una giornata tipica",
    description:
      "Descrivi una tua giornata normale. A che ora ti svegli? Cosa mangi a colazione? Cosa fai durante il giorno? A che ora vai a dormire?",
    level: "A1",
    category: "DailyLife",
  },
  {
    title: "Il cibo che mi piace",
    description:
      "Qual è il tuo cibo preferito? Cosa mangi di solito a pranzo e a cena? Sai cucinare? Preferisci mangiare al ristorante o a casa?",
    level: "A1",
    category: "Food",
  },
  {
    title: "Il mio tempo libero",
    description:
      "Cosa ti piace fare nel tuo tempo libero? Hai degli hobby? Guardi la televisione, leggi libri, fai sport? Con chi passi il tempo libero?",
    level: "A1",
    category: "DailyLife",
  },
  // ── A2 ──────────────────────────────────────────────────────────
  {
    title: "Le mie vacanze",
    description:
      "Dove ti piace andare in vacanza? Preferisci il mare o la montagna? Racconta dell'ultima vacanza che hai fatto: dove sei andato, con chi e cosa hai fatto.",
    level: "A2",
    category: "Travel",
  },
  {
    title: "Imparare l'italiano",
    description:
      "Perché hai deciso di studiare l'italiano? Da quanto tempo lo studi? Cosa è facile e cosa è difficile per te? Hai mai visitato l'Italia?",
    level: "A2",
    category: "Society",
  },
  {
    title: "La mia città",
    description:
      "Com'è la città in cui vivi? È grande o piccola? Cosa si può fare? Ci sono posti belli da vedere? Ti piace vivere lì o preferiresti abitare altrove?",
    level: "A2",
    category: "DailyLife",
  },
  {
    title: "Il fine settimana scorso",
    description:
      "Cosa hai fatto lo scorso fine settimana? Sei uscito con gli amici, sei rimasto a casa, hai viaggiato? Racconta com'è andata la tua giornata preferita.",
    level: "A2",
    category: "DailyLife",
  },
  // ── B2 / C1 ─────────────────────────────────────────────────────
  {
    title: "Il futuro del lavoro remoto",
    description:
      "Molte aziende stanno adottando il lavoro da remoto in modo permanente. Secondo te, quali sono i vantaggi e gli svantaggi di lavorare da casa? Come cambierà il mondo del lavoro nei prossimi dieci anni?",
    level: "B2",
    category: "Technology",
  },
  {
    title: "L'intelligenza artificiale nella vita quotidiana",
    description:
      "L'intelligenza artificiale sta diventando sempre più presente nella nostra vita quotidiana, dai suggerimenti di Netflix agli assistenti vocali. Pensi che l'IA migliori la qualità della vita o che ci renda troppo dipendenti dalla tecnologia?",
    level: "B2",
    category: "Technology",
  },
  {
    title: "La cucina italiana e l'identità culturale",
    description:
      "La cucina italiana è famosa in tutto il mondo, ma spesso viene modificata per adattarsi ai gusti locali. Cosa ne pensi della 'carbonara con la panna' o della 'pizza hawaiana'? È importante preservare le ricette tradizionali o l'evoluzione è naturale?",
    level: "B2",
    category: "Food",
  },
  {
    title: "Vivere all'estero: sfide e opportunità",
    description:
      "Trasferirsi in un altro paese comporta molte sfide: la lingua, la burocrazia, la nostalgia di casa. Hai mai vissuto o vorresti vivere all'estero? Quali sono secondo te le difficoltà principali e come si possono superare?",
    level: "B2",
    category: "Travel",
  },
  {
    title: "Il cambiamento climatico e le scelte individuali",
    description:
      "Alcuni sostengono che le azioni individuali, come ridurre il consumo di carne o usare meno plastica, possano fare la differenza nella lotta al cambiamento climatico. Altri pensano che solo i governi e le grandi aziende possano avere un impatto reale. Tu cosa ne pensi?",
    level: "C1",
    category: "Society",
  },
  {
    title: "I social media e la salute mentale",
    description:
      "I social media ci permettono di restare connessi, ma diversi studi collegano l'uso eccessivo a problemi di ansia e autostima, soprattutto tra i giovani. Come gestisci il tuo rapporto con i social? Pensi che servano delle regole più severe?",
    level: "B2",
    category: "Society",
  },
  {
    title: "Il sistema universitario italiano",
    description:
      "Il sistema universitario italiano è molto diverso da quello di altri paesi: esami orali, nessun limite di tempo per laurearsi, e il voto di laurea su 110. Quali sono i punti di forza e le debolezze di questo sistema rispetto ad altri che conosci?",
    level: "C1",
    category: "Society",
  },
  {
    title: "Viaggiare da soli: libertà o solitudine?",
    description:
      "Viaggiare da soli sta diventando sempre più popolare. C'è chi lo considera un'esperienza di crescita personale e chi lo trova poco sicuro o troppo solitario. Raccontami la tua opinione ed eventualmente un'esperienza di viaggio che ti ha segnato.",
    level: "B2",
    category: "Travel",
  },
];

const placementQuestions = [
  // ── A1 ──────────────────────────────────────────────────────────
  { level: "A1", sortOrder: 1, question: "Ciao, come ___ chiami?", options: ["ti", "si", "mi", "ci"], answer: 0 },
  { level: "A1", sortOrder: 2, question: "___ italiano. Sono di Roma.", options: ["Sei", "Sono", "Siamo", "È"], answer: 1 },
  { level: "A1", sortOrder: 3, question: "Tutti i giorni vado ___ scuola in autobus.", options: ["a", "in", "di", "da"], answer: 0 },
  { level: "A1", sortOrder: 4, question: "Ho ventidue ___.", options: ["anno", "anni", "annata", "tempo"], answer: 1 },
  // ── A2 ──────────────────────────────────────────────────────────
  { level: "A2", sortOrder: 5, question: "Ieri sera ___ una bella cena con gli amici.", options: ["faccio", "facevo", "ho fatto", "farò"], answer: 2 },
  { level: "A2", sortOrder: 6, question: "Da bambino ___ sempre al parco la domenica.", options: ["sono andato", "andai", "andavo", "vado"], answer: 2 },
  { level: "A2", sortOrder: 7, question: "Questo libro è ___ interessante di quello.", options: ["più", "tanto", "molto", "il più"], answer: 0 },
  { level: "A2", sortOrder: 8, question: "A me ___ moltissimo la cucina italiana.", options: ["piace", "piaccio", "piacciono", "piacere"], answer: 0 },
  // ── B1 ──────────────────────────────────────────────────────────
  { level: "B1", sortOrder: 9, question: "Domani ___ a Milano per lavoro.", options: ["sono andato", "andavo", "andrò", "vado andando"], answer: 2 },
  { level: "B1", sortOrder: 10, question: "Se avessi più tempo, ___ studiare l'italiano ogni giorno.", options: ["potrei", "posso", "potevo", "potrò"], answer: 0 },
  { level: "B1", sortOrder: 11, question: "Penso che Marco ___ ragione.", options: ["ha", "abbia", "avrebbe", "avesse"], answer: 1 },
  { level: "B1", sortOrder: 12, question: "L'ho incontrato ___ andavo al lavoro.", options: ["mentre", "durante", "intanto", "perché"], answer: 0 },
  // ── B2 ──────────────────────────────────────────────────────────
  { level: "B2", sortOrder: 13, question: "Benché ___ stanco, è uscito a correre.", options: ["era", "è", "fosse", "sarà"], answer: 2 },
  { level: "B2", sortOrder: 14, question: "Se l'avessi saputo prima, ___ venuto alla festa.", options: ["sarei", "ero", "sono", "fossi"], answer: 0 },
  { level: "B2", sortOrder: 15, question: "Il film ___ ti ho parlato è uscito ieri.", options: ["che", "di cui", "in cui", "il quale"], answer: 1 },
  { level: "B2", sortOrder: 16, question: "Spero che il treno non ___ in ritardo.", options: ["è", "sia", "era", "fosse"], answer: 1 },
  // ── C1 ──────────────────────────────────────────────────────────
  { level: "C1", sortOrder: 17, question: "Per quanto ___ , non sono riusciti a convincerlo.", options: ["si sforzano", "si sforzino", "si sforzassero", "si sforzeranno"], answer: 1 },
  { level: "C1", sortOrder: 18, question: "Magari ___ sapere prima della tua decisione!", options: ["potessi", "potrei", "ho potuto", "posso"], answer: 0 },
  { level: "C1", sortOrder: 19, question: "Una volta ___ il discorso, è uscito dalla sala.", options: ["finito", "finire", "finiva", "finisce"], answer: 0 },
  { level: "C1", sortOrder: 20, question: "È un libro che vale la ___ leggere.", options: ["pena", "fatica", "voglia", "scelta"], answer: 0 },
  // ── C2 ──────────────────────────────────────────────────────────
  { level: "C2", sortOrder: 21, question: "Pur ___ raffreddato, ha tenuto la conferenza.", options: ["essendo", "era", "stato", "essendo stato"], answer: 0 },
  { level: "C2", sortOrder: 22, question: "Fosse stato per me, ___ già firmato il contratto.", options: ["avrei", "avevo", "ho", "avessi"], answer: 0 },
  { level: "C2", sortOrder: 23, question: "Si tratta di ___ il prima possibile.", options: ["risolverlo", "lo risolvere", "risolvere lo", "risolverlo lo"], answer: 0 },
  { level: "C2", sortOrder: 24, question: "Non v'è dubbio che le sue parole ___ a fondo.", options: ["colpiscono", "colpiscano", "colpirebbero", "colpirono"], answer: 1 },
];

async function main() {
  console.log("Upserting topics...");
  for (const t of topics) {
    await prisma.topic.upsert({
      where: { title: t.title },
      update: { description: t.description, level: t.level, category: t.category },
      create: t,
    });
  }
  console.log(`Upserted ${topics.length} topics.`);

  console.log("Upserting placement questions...");
  for (const q of placementQuestions) {
    await prisma.placementQuestion.upsert({
      where: { level_sortOrder: { level: q.level, sortOrder: q.sortOrder } },
      update: { question: q.question, options: q.options, answer: q.answer },
      create: q,
    });
  }
  console.log(`Upserted ${placementQuestions.length} placement questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
