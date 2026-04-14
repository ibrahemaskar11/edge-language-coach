import { groq } from "../lib/groq.js";
import { createServiceClient } from "../lib/supabase.js";

const FLASHCARD_SYSTEM_PROMPT = `You are an Italian language learning assistant. Given a conversation transcript from a coaching session, extract 5–8 flashcard items the student should review.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "flashcards": [
    {"type": "VOCABULARY", "front": "Italian word or phrase", "back": "English meaning or explanation"},
    {"type": "GRAMMAR", "front": "Grammar concept question", "back": "Answer with a clear Italian example"},
    {"type": "TRANSLATE TO ITALIAN", "front": "English sentence", "back": "Italian translation"}
  ]
}

Rules:
- Focus on: vocabulary the student used or struggled with, grammar patterns from corrections, useful phrases introduced by the coach
- Mix the three types across the set
- Keep front/back concise — flashcard format, not an essay
- Prefer items the student got wrong or that were explicitly corrected
- If the conversation is too short to extract 5 items, return what you can`;

const VALID_TYPES = new Set(["VOCABULARY", "GRAMMAR", "TRANSLATE TO ITALIAN"]);

export async function runFlashcardGeneration(sessionId: string, userId: string): Promise<number> {
  const db = createServiceClient();

  // 1. Fetch session + topic title
  const { data: sessions } = await db
    .from("sessions")
    .select("topic_id, topic:topics(title)")
    .eq("id", sessionId);

  if (!sessions || sessions.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const session = sessions[0] as unknown as { topic_id: string; topic: { title: string } | null };
  const topicId = session.topic_id;
  const topicTitle = session.topic?.title ?? "Unknown";

  // 2. Fetch messages
  const { data: messages } = await db
    .from("messages")
    .select("role, content, turn")
    .eq("session_id", sessionId)
    .order("turn", { ascending: true })
    .order("created_at", { ascending: true });

  if (!messages || messages.length === 0) {
    console.log(`flashcard-job: session ${sessionId} has no messages, skipping`);
    return 0;
  }

  // 3. Build transcript
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Student" : "Coach"}: ${m.content}`)
    .join("\n");

  // 4. Fetch existing flashcard fronts for deduplication
  const { data: existingCards } = await db
    .from("flashcards")
    .select("front")
    .eq("topic_id", topicId);

  const existingFronts = new Set(
    (existingCards ?? []).map((c) => c.front.toLowerCase().trim())
  );

  // 5. Call Groq
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: FLASHCARD_SYSTEM_PROMPT },
      { role: "user", content: `Topic: ${topicTitle}\n\nConversation transcript:\n${transcript}` },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { flashcards?: Array<{ type: string; front: string; back: string }> };
  const cards = parsed.flashcards ?? [];

  // 6. Insert new flashcards
  let generated = 0;
  for (const card of cards) {
    const normFront = card.front.toLowerCase().trim();
    if (existingFronts.has(normFront) || !card.front || !card.back) continue;

    const cardType = VALID_TYPES.has(card.type) ? card.type : "VOCABULARY";

    const { data: inserted, error: fcErr } = await db
      .from("flashcards")
      .insert({ topic_id: topicId, type: cardType, front: card.front, back: card.back })
      .select("id")
      .single();

    if (fcErr || !inserted) {
      console.warn(`flashcard-job: insert error: ${fcErr?.message}`);
      continue;
    }

    // Link to user (ignore conflict if already linked)
    await db
      .from("user_flashcards")
      .upsert({ user_id: userId, flashcard_id: inserted.id }, { onConflict: "user_id,flashcard_id", ignoreDuplicates: true });

    // Ensure deck shows up on flashcard page
    await db
      .from("user_topics")
      .upsert({ user_id: userId, topic_id: topicId }, { onConflict: "user_id,topic_id", ignoreDuplicates: true });

    existingFronts.add(normFront);
    generated++;
    console.log(`flashcard-job: created "${card.front}" [${cardType}]`);
  }

  console.log(`flashcard-job: session ${sessionId} — generated ${generated} new flashcards`);
  return generated;
}
