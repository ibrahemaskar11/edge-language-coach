import fp from "fastify-plugin";
import Groq from "groq-sdk";
import CircuitBreaker from "opossum";
import type { FastifyInstance } from "fastify";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";
import { env } from "../env.js";
import { groqRequestDuration } from "../lib/metrics.js";

function observeGroq<T>(operation: "chat" | "transcribe", fn: () => Promise<T>): Promise<T> {
  const end = groqRequestDuration.startTimer({ operation });
  return fn().then(
    (result) => {
      end({ status: "success" });
      return result;
    },
    (err) => {
      end({ status: "error" });
      throw err;
    },
  );
}

type ChatArgs = ChatCompletionCreateParamsNonStreaming;
type ChatResult = ChatCompletion;
type TranscribeArgs = Parameters<Groq["audio"]["transcriptions"]["create"]>[0];
type TranscribeResult = Awaited<ReturnType<Groq["audio"]["transcriptions"]["create"]>>;

declare module "fastify" {
  interface FastifyInstance {
    groq: Groq;
    groqChat: (args: ChatArgs) => Promise<ChatResult>;
    groqTranscribe: (args: TranscribeArgs) => Promise<TranscribeResult>;
    groqBreakers: {
      chat: CircuitBreaker<[ChatArgs], ChatResult>;
      transcribe: CircuitBreaker<[TranscribeArgs], TranscribeResult>;
    };
  }
}

export const groqPlugin = fp(async (fastify: FastifyInstance) => {
  const groq = new Groq({
    apiKey: env.GROQ_API_KEY,
    ...(env.GROQ_BASE_URL ? { baseURL: env.GROQ_BASE_URL } : {}),
  });

  if (env.GROQ_BASE_URL) {
    fastify.log.warn({ baseURL: env.GROQ_BASE_URL }, "Groq SDK pointed at non-default baseURL (mock?)");
  }

  const chatBreaker = new CircuitBreaker<[ChatArgs], ChatResult>(
    (args) => observeGroq("chat", () => groq.chat.completions.create(args) as Promise<ChatResult>),
    {
      name: "groq-chat",
      timeout: 15_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
      volumeThreshold: 10,
      rollingCountTimeout: 60_000,
    },
  );

  // Whisper transcription tolerates longer responses (audio decode + inference)
  const transcribeBreaker = new CircuitBreaker<[TranscribeArgs], TranscribeResult>(
    (args) => observeGroq("transcribe", () => groq.audio.transcriptions.create(args) as Promise<TranscribeResult>),
    {
      name: "groq-transcribe",
      timeout: 60_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
      volumeThreshold: 5,
      rollingCountTimeout: 60_000,
    },
  );

  for (const breaker of [chatBreaker, transcribeBreaker]) {
    breaker.on("open", () => fastify.log.warn({ breaker: breaker.name }, "circuit breaker opened"));
    breaker.on("halfOpen", () => fastify.log.info({ breaker: breaker.name }, "circuit breaker half-open"));
    breaker.on("close", () => fastify.log.info({ breaker: breaker.name }, "circuit breaker closed"));
  }

  fastify.decorate("groq", groq);
  fastify.decorate("groqChat", (args: ChatArgs) => chatBreaker.fire(args));
  fastify.decorate("groqTranscribe", (args: TranscribeArgs) => transcribeBreaker.fire(args));
  fastify.decorate("groqBreakers", { chat: chatBreaker, transcribe: transcribeBreaker });

  fastify.addHook("onClose", async () => {
    chatBreaker.shutdown();
    transcribeBreaker.shutdown();
  });
});
