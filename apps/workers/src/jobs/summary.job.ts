import { groq } from "../lib/groq.js";
import { createServiceClient } from "../lib/supabase.js";

const SUMMARY_SYSTEM_PROMPT = `You are an Italian language learning analyst. Given a coaching session transcript and the feedback that was generated, produce a structured summary of the student's performance.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "overallNote": "2–3 sentence assessment of the student's performance in this session",
  "keyVocabulary": ["Italian phrase or word the student used or was introduced to"],
  "grammarFocus": ["Grammar pattern practiced or corrected in this session"],
  "mistakeTags": ["High-level mistake category, e.g. Passato Prossimo, Article Agreement, Verb Conjugation"],
  "score": 7,
  "encouragement": "A brief, warm motivational message in English for the student"
}

Rules:
- keyVocabulary: 3–5 items, prefer Italian phrases the student used or the coach introduced
- grammarFocus: 2–3 patterns; derive from the corrections and conversation flow
- mistakeTags: 1–4 high-level categories summarising the mistakes; use consistent Italian grammar terms
- score: integer 1–10 reflecting overall session quality (vocabulary, grammar, engagement)
- encouragement: 1–2 sentences, warm and specific to what went well
- If the session is very short or has no mistakes, still return all fields with empty arrays where appropriate`;

interface MistakeItem {
  original: string;
  correction: string;
  explanation: string;
}

interface GoodPointItem {
  phrase: string;
  reason: string;
}

export async function runSummaryGeneration(sessionId: string, userId: string): Promise<void> {
  const db = createServiceClient();

  // 1. Fetch session + validate
  const { data: sessions } = await db
    .from("sessions")
    .select("id, user_id, status, topic:topics(title)")
    .eq("id", sessionId);

  if (!sessions || sessions.length === 0) throw new Error(`Session not found: ${sessionId}`);
  const session = sessions[0] as unknown as { id: string; user_id: string; status: string; topic: { title: string } | null };

  if (session.user_id !== userId) throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
  if (session.status !== "complete") throw new Error(`Session ${sessionId} is not complete (status: ${session.status})`);

  const topicTitle = session.topic?.title ?? "Unknown";

  // 2. Fetch messages
  const { data: messages } = await db
    .from("messages")
    .select("role, content, turn")
    .eq("session_id", sessionId)
    .order("turn", { ascending: true })
    .order("created_at", { ascending: true });

  if (!messages || messages.length === 0) {
    console.log(`summary-job: session ${sessionId} has no messages, skipping`);
    return;
  }

  // 3. Build transcript
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Student" : "Coach"}: ${m.content}`)
    .join("\n");

  // 4. Fetch feedback
  const { data: feedbackRows } = await db
    .from("feedback")
    .select("type, content")
    .eq("session_id", sessionId);

  // 5. Extract mistakes + good points into readable strings
  const mistakeLines: string[] = [];
  const goodPointLines: string[] = [];

  for (const fb of feedbackRows ?? []) {
    const content = fb.content as Record<string, unknown>;
    if (fb.type === "mistakes" && Array.isArray(content?.mistakes)) {
      for (const m of content.mistakes as MistakeItem[]) {
        mistakeLines.push(`- "${m.original}" → "${m.correction}": ${m.explanation}`);
      }
    } else if (fb.type === "good_points" && Array.isArray(content?.goodPoints)) {
      for (const gp of content.goodPoints as GoodPointItem[]) {
        goodPointLines.push(`- "${gp.phrase}": ${gp.reason}`);
      }
    }
  }

  const mistakesStr = mistakeLines.length > 0 ? mistakeLines.join("\n") : "(none)";
  const goodPointsStr = goodPointLines.length > 0 ? goodPointLines.join("\n") : "(none)";

  // 6. Call Groq
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Topic: ${topicTitle}\n\nTranscript:\n${transcript}\n\nMistakes made:\n${mistakesStr}\n\nGood points:\n${goodPointsStr}`,
      },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const summary = JSON.parse(raw) as {
    overallNote: string;
    keyVocabulary: string[];
    grammarFocus: string[];
    mistakeTags: string[];
    score: number;
    encouragement: string;
  };

  // Clamp score to 1–10
  summary.score = Math.max(1, Math.min(10, summary.score ?? 5));

  // 7. Store on session
  const { error } = await db
    .from("sessions")
    .update({ summary })
    .eq("id", sessionId);

  if (error) throw new Error(`Failed to update session summary: ${error.message}`);

  console.log(`summary-job: session ${sessionId} — summary stored (score ${summary.score})`);
}
