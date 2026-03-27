import { PrismaClient } from "./generated/prisma/client.js";

const prisma = new PrismaClient();

const topics = [
  {
    title: "Il futuro del lavoro remoto",
    description:
      "Molte aziende stanno adottando il lavoro da remoto in modo permanente. Secondo te, quali sono i vantaggi e gli svantaggi di lavorare da casa? Come cambierà il mondo del lavoro nei prossimi dieci anni?",
    level: "B2",
    category: "technology",
  },
  {
    title: "L'intelligenza artificiale nella vita quotidiana",
    description:
      "L'intelligenza artificiale sta diventando sempre più presente nella nostra vita quotidiana, dai suggerimenti di Netflix agli assistenti vocali. Pensi che l'IA migliori la qualità della vita o che ci renda troppo dipendenti dalla tecnologia?",
    level: "B2",
    category: "technology",
  },
  {
    title: "La cucina italiana e l'identità culturale",
    description:
      "La cucina italiana è famosa in tutto il mondo, ma spesso viene modificata per adattarsi ai gusti locali. Cosa ne pensi della 'carbonara con la panna' o della 'pizza hawaiana'? È importante preservare le ricette tradizionali o l'evoluzione è naturale?",
    level: "B2",
    category: "culture",
  },
  {
    title: "Vivere all'estero: sfide e opportunità",
    description:
      "Trasferirsi in un altro paese comporta molte sfide: la lingua, la burocrazia, la nostalgia di casa. Hai mai vissuto o vorresti vivere all'estero? Quali sono secondo te le difficoltà principali e come si possono superare?",
    level: "B2",
    category: "lifestyle",
  },
  {
    title: "Il cambiamento climatico e le scelte individuali",
    description:
      "Alcuni sostengono che le azioni individuali, come ridurre il consumo di carne o usare meno plastica, possano fare la differenza nella lotta al cambiamento climatico. Altri pensano che solo i governi e le grandi aziende possano avere un impatto reale. Tu cosa ne pensi?",
    level: "C1",
    category: "environment",
  },
  {
    title: "I social media e la salute mentale",
    description:
      "I social media ci permettono di restare connessi, ma diversi studi collegano l'uso eccessivo a problemi di ansia e autostima, soprattutto tra i giovani. Come gestisci il tuo rapporto con i social? Pensi che servano delle regole più severe?",
    level: "B2",
    category: "society",
  },
  {
    title: "Il sistema universitario italiano",
    description:
      "Il sistema universitario italiano è molto diverso da quello di altri paesi: esami orali, nessun limite di tempo per laurearsi, e il voto di laurea su 110. Quali sono i punti di forza e le debolezze di questo sistema rispetto ad altri che conosci?",
    level: "C1",
    category: "education",
  },
  {
    title: "Viaggiare da soli: libertà o solitudine?",
    description:
      "Viaggiare da soli sta diventando sempre più popolare. C'è chi lo considera un'esperienza di crescita personale e chi lo trova poco sicuro o troppo solitario. Raccontami la tua opinione ed eventualmente un'esperienza di viaggio che ti ha segnato.",
    level: "B2",
    category: "lifestyle",
  },
];

async function main() {
  console.log("Seeding topics...");

  await prisma.topic.deleteMany();
  const created = await prisma.topic.createMany({ data: topics });

  console.log(`Seeded ${created.count} topics.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
