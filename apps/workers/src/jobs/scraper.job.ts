import RSSParser from "rss-parser";
import { groq } from "../lib/groq.js";
import { createServiceClient } from "../lib/supabase.js";

// ─── Configuration ────────────────────────────────────────

const DEFAULT_FEEDS = [
  "https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml",
  "https://www.corriere.it/rss/homepage.xml",
  "https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml",
  "https://www.corriere.it/rss/sport.xml",
  "https://www.gazzetta.it/rss/homepage.xml",
  "https://ricette.giallozafferano.it/feed/",
  "https://www.viaggiamo.it/feed/",
  "https://www.wired.it/feed/rss",
];

const HEAVY_KEYWORDS = [
  "guerra", "conflitto armato", "bombardamento", "missili", "attacco militare",
  "morti", "vittime", "ostaggi", "terrorismo", "attentato",
  "sanzioni", "embargo", "escalation",
];

// Politics excluded (cap = 0); lifestyle categories get more room
const CATEGORY_CAPS: Record<string, number> = {
  Politics: 0,
  Economy: 1,
  Society: 4,
  Sports: 1,
  "Daily Life": 4,
  Culture: 3,
  Food: 4,
  Travel: 3,
  Technology: 2,
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_CAPS));
const VALID_LEVELS = new Set(["A2", "B1", "B2", "C1"]);
const ROTATION_POOL_SIZE = parseInt(process.env.ROTATION_POOL_SIZE ?? "50", 10);

// ─── Types ───────────────────────────────────────────────

interface Article {
  title: string;
  description: string;
  publishedAt: Date;
}

interface TopicExtract {
  title: string;
  description: string;
  level: string;
  category: string;
  talkingPoints: string[];
}

// ─── RSS Fetcher ─────────────────────────────────────────

async function fetchArticles(feedUrls?: string[]): Promise<Article[]> {
  const urls = feedUrls ?? DEFAULT_FEEDS;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const parser = new RSSParser({ timeout: 10000 });
  const articles: Article[] = [];

  for (const url of urls) {
    if (articles.length >= 30) break;
    try {
      const feed = await parser.parseURL(url);
      let count = 0;
      for (const item of feed.items) {
        if (count >= 10 || articles.length >= 30) break;

        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        if (pubDate < cutoff) continue;

        const title = item.title ?? "";
        const desc = item.contentSnippet ?? item.content ?? item.summary ?? title;

        if (isHeavy(title, desc)) {
          console.log(`scraper-job: skipping heavy article "${title}"`);
          continue;
        }

        articles.push({ title, description: desc, publishedAt: pubDate });
        count++;
      }
    } catch (err) {
      console.warn(`scraper-job: failed to parse ${url}: ${err}`);
    }
  }

  return articles;
}

function isHeavy(title: string, desc: string): boolean {
  const combined = (title + " " + desc).toLowerCase();
  return HEAVY_KEYWORDS.some((kw) => combined.includes(kw));
}

// ─── Groq Topic Extraction ────────────────────────────────

const TOPIC_SYSTEM_PROMPT = `You are a curriculum designer for an Italian language learning app. Given an Italian news article, reformat it into a structured language-learning topic.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "title": "Short, engaging topic title (in English)",
  "description": "2–3 sentence description suitable for a language learner (in English)",
  "level": "A2|B1|B2|C1",
  "category": "Daily Life|Technology|Culture|Society|Sports|Politics|Economy|Food|Travel",
  "talkingPoints": ["3–5 conversation prompts in Italian"]
}

Rules:
- title: concise, max 8 words
- level: choose based on vocabulary complexity of the article
- category: choose the single best fit
- talkingPoints: open-ended questions in Italian that would prompt natural conversation`;

async function extractTopic(title: string, description: string): Promise<TopicExtract> {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: TOPIC_SYSTEM_PROMPT },
      { role: "user", content: `Article title: ${title}\n\nArticle summary: ${description}` },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as TopicExtract;
}

// ─── Deduplication ────────────────────────────────────────

function isDuplicate(newTitle: string, existing: string[]): boolean {
  const norm = newTitle.toLowerCase().trim();
  for (const t of existing) {
    const e = t.toLowerCase().trim();
    if (e === norm) return true;
    if ((norm.startsWith(e) || e.startsWith(norm)) && Math.abs(norm.length - e.length) < 20) {
      return true;
    }
  }
  return false;
}

// ─── Rotator ─────────────────────────────────────────────

async function runRotator(): Promise<void> {
  const db = createServiceClient();

  const { data: topics } = await db.from("topics").select("id, created_at");
  if (!topics || topics.length === 0) return;

  const { data: sessions } = await db.from("sessions").select("topic_id");
  const sessionCounts: Record<string, number> = {};
  for (const s of sessions ?? []) {
    sessionCounts[s.topic_id] = (sessionCounts[s.topic_id] ?? 0) + 1;
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const scored = topics.map((t) => {
    let score = (sessionCounts[t.id] ?? 0) * 2;
    const createdMs = new Date(t.created_at).getTime();
    if (createdMs > sevenDaysAgo) score += 10;
    else if (createdMs > thirtyDaysAgo) score += 3;
    return { id: t.id, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const poolSize = Math.min(ROTATION_POOL_SIZE, scored.length);
  const activeIds = scored.slice(0, poolSize).map((s) => s.id);
  const inactiveIds = scored.slice(poolSize).map((s) => s.id);

  if (activeIds.length > 0) {
    await db.from("topics").update({ is_active: true }).in("id", activeIds);
    console.log(`rotator: activated ${activeIds.length} topics`);
  }
  if (inactiveIds.length > 0) {
    await db.from("topics").update({ is_active: false }).in("id", inactiveIds);
    console.log(`rotator: deactivated ${inactiveIds.length} topics`);
  }
}

// ─── Main Scraper ─────────────────────────────────────────

export async function runScraper(): Promise<void> {
  console.log("scraper-job: starting run");
  const db = createServiceClient();
  const feedUrls = process.env.RSS_FEEDS?.split(",") ?? DEFAULT_FEEDS;

  const articles = await fetchArticles(feedUrls);
  console.log(`scraper-job: fetched ${articles.length} articles`);

  // Fetch existing titles from last 30 days for deduplication
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingRows } = await db
    .from("topics")
    .select("title")
    .gte("created_at", cutoff30);

  const existingTitles: string[] = (existingRows ?? []).map((r) => r.title);
  const categoryCounts: Record<string, number> = {};
  let inserted = 0;
  let skipped = 0;

  for (const article of articles) {
    let topic: TopicExtract;
    try {
      topic = await extractTopic(article.title, article.description);
    } catch (err) {
      console.warn(`scraper-job: groq error for "${article.title}": ${err}`);
      continue;
    }

    if (isDuplicate(topic.title, existingTitles)) {
      console.log(`scraper-job: skipping duplicate "${topic.title}"`);
      skipped++;
      continue;
    }

    if (!VALID_CATEGORIES.has(topic.category)) topic.category = "Daily Life";
    if (!VALID_LEVELS.has(topic.level)) topic.level = "B1";

    const cap = CATEGORY_CAPS[topic.category] ?? 2;
    if ((categoryCounts[topic.category] ?? 0) >= cap) {
      console.log(`scraper-job: skipping "${topic.title}" — category "${topic.category}" cap reached`);
      skipped++;
      continue;
    }

    const { error } = await db.from("topics").insert({
      title: topic.title,
      description: topic.description,
      level: topic.level,
      category: topic.category,
      talking_points: topic.talkingPoints,
    });

    if (error) {
      console.warn(`scraper-job: insert error for "${topic.title}": ${error.message}`);
      continue;
    }

    existingTitles.push(topic.title);
    categoryCounts[topic.category] = (categoryCounts[topic.category] ?? 0) + 1;
    inserted++;
    console.log(`scraper-job: inserted "${topic.title}" [${topic.level}/${topic.category}]`);

    // Rate-limit: ~5s between Groq calls to stay under 12k TPM free tier
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`scraper-job: complete — inserted=${inserted} skipped=${skipped}`);

  // Re-score and rotate the active topic pool
  await runRotator();
}
