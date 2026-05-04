import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8080);

const state = {
  mode: "normal",
  slowDelayMs: 30_000,
  requests: 0,
};

function chatCompletionStub(model) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model ?? "llama-3.3-70b-versatile",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "(mock response from groq-mock)" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function transcriptionStub() {
  return { text: "(mock transcription from groq-mock)" };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain" : "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function applyMode(res, ok) {
  if (state.mode === "error") {
    return send(res, 500, { error: { message: "mock-induced 500", type: "mock_error" } });
  }
  if (state.mode === "slow") {
    await new Promise((r) => setTimeout(r, state.slowDelayMs));
  }
  return send(res, 200, ok);
}

const server = createServer(async (req, res) => {
  state.requests++;
  const url = req.url ?? "/";

  // Admin: get current mode
  if (req.method === "GET" && url === "/admin/mode") {
    return send(res, 200, { ...state });
  }

  // Admin: set mode → POST { mode: "normal" | "slow" | "error", slowDelayMs?: number }
  if (req.method === "POST" && url === "/admin/mode") {
    try {
      const body = await readJson(req);
      if (body.mode && !["normal", "slow", "error"].includes(body.mode)) {
        return send(res, 400, { error: "mode must be normal | slow | error" });
      }
      if (body.mode) state.mode = body.mode;
      if (typeof body.slowDelayMs === "number") state.slowDelayMs = body.slowDelayMs;
      console.log(`[groq-mock] mode set to ${state.mode} (slowDelayMs=${state.slowDelayMs})`);
      return send(res, 200, { ...state });
    } catch {
      return send(res, 400, { error: "invalid JSON body" });
    }
  }

  // Chat completions (matches any baseURL prefix)
  if (req.method === "POST" && url.endsWith("/chat/completions")) {
    let body = {};
    try {
      body = await readJson(req);
    } catch {
      // fall through with empty body
    }
    return applyMode(res, chatCompletionStub(body.model));
  }

  // Audio transcriptions
  if (req.method === "POST" && url.endsWith("/audio/transcriptions")) {
    return applyMode(res, transcriptionStub());
  }

  return send(res, 404, { error: `no mock route for ${req.method} ${url}` });
});

server.listen(PORT, () => {
  console.log(`[groq-mock] listening on http://localhost:${PORT}`);
  console.log(`[groq-mock] mode: ${state.mode}`);
  console.log(`[groq-mock] toggle: curl -X POST http://localhost:${PORT}/admin/mode -d '{"mode":"slow"}' -H "content-type: application/json"`);
});
