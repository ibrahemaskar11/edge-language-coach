import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

// ── Sidebar icons (same as app) ───────────────────────────────────
function IconTopics() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  );
}
function IconFlashcards() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
    </svg>
  );
}
function IconReports() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" x2="18" y1="20" y2="10"/>
      <line x1="12" x2="12" y1="20" y2="4"/>
      <line x1="6" x2="6" y1="20" y2="14"/>
    </svg>
  );
}
function IconChats() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.5">
      <circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>
    </svg>
  );
}

// ── Decorative rings ──────────────────────────────────────────────
function Rings({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="600" height="600" viewBox="0 0 600 600" fill="none" aria-hidden>
      <circle cx="300" cy="300" r="90"  stroke="#C9A96E" strokeWidth="1"   opacity="0.16"/>
      <circle cx="300" cy="300" r="155" stroke="#C9A96E" strokeWidth="1"   opacity="0.11"/>
      <circle cx="300" cy="300" r="220" stroke="#C9A96E" strokeWidth="0.8" opacity="0.07"/>
      <circle cx="300" cy="300" r="285" stroke="#C9A96E" strokeWidth="0.8" opacity="0.04"/>
      <circle cx="300" cy="300" r="300" stroke="#C9A96E" strokeWidth="0.5" opacity="0.025"/>
    </svg>
  );
}

function Dots({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="260" height="300" viewBox="0 0 260 300" fill="none" aria-hidden>
      <g fill="#C9A96E" opacity="0.18">
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 7 }, (_, c) => (
            <circle key={`${r}-${c}`} cx={10 + c * 38} cy={10 + r * 38} r="1.4"/>
          ))
        )}
      </g>
    </svg>
  );
}

// ── Single marquee ────────────────────────────────────────────────
const WORDS = [
  "Conversazione","·","Vocabolario","·","Grammatica","·",
  "AI Coaching","·","Flashcard","·","Progresso","·",
  "Pronuncia","·","Fluency","·","Sessioni","·",
  "Italian","·","Correzioni","·","Comprensione","·",
];

function Marquee() {
  const doubled = [...WORDS, ...WORDS];
  return (
    <div className="overflow-hidden border-y border-[#1E1E1E] py-[14px]">
      <div className="flex gap-7 whitespace-nowrap" style={{ animation: "marquee 30s linear infinite", width: "max-content" }}>
        {doubled.map((w, i) => (
          <span key={i} className={`font-mono text-[11px] uppercase tracking-[0.12em] ${w === "·" ? "text-[#C9A96E]" : "text-[#383432]"}`}>
            {w}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .reveal{opacity:0;transform:translateY(28px);transition:opacity 0.65s cubic-bezier(.22,1,.36,1),transform 0.65s cubic-bezier(.22,1,.36,1)}
      `}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────
function LandingPage() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);

  useEffect(() => {
    if (authLoading) return;
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "translateY(0)";
          observer.unobserve(e.target);
        }
      }),
      { threshold: 0.12 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [authLoading]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="bg-[#0C0C0C] text-[#F0EDE8]">

      {/* ── STICKY NAV ── */}
      <nav className="sticky top-0 z-50 flex h-[68px] items-center border-b border-[#1E1E1E] bg-[#0C0C0C]/90 px-10 backdrop-blur-md md:px-20">
        <img src="/logo-dark.svg" className="h-8 w-8 shrink-0" alt="edge"/>
        {/* Absolutely centered links */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 md:flex">
          {[["How it works","how"],["Features","features"],["Progress","progress"]].map(([label,id]) => (
            <button key={id} onClick={() => scrollTo(id!)} className="text-sm text-[#8A8480] transition-colors hover:text-[#F0EDE8]">
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5">
          {user ? (
            <Link to="/playground" className="text-sm text-[#8A8480] transition-colors hover:text-[#F0EDE8]">
              Go to Playground
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-[#8A8480] transition-colors hover:text-[#F0EDE8]">Sign in</Link>
              <Link to="/register" className="rounded-md bg-[#C9A96E] px-5 py-2.5 text-sm font-semibold text-[#0C0C0C] transition-opacity hover:opacity-90">
                Start for free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ══════════════════════════════════════
          SECTION 1 — HERO
      ══════════════════════════════════════ */}
      <section
        id="hero"
        className="relative flex min-h-[calc(100vh-68px)] flex-col justify-center overflow-hidden"
      >
        {/* FX */}
        <div className="pointer-events-none absolute left-[-8%] top-[-15%] h-[660px] w-[660px] rounded-full bg-[#C9A96E]/[0.055] blur-[120px]"/>
        <Rings className="pointer-events-none absolute right-[-12%] top-[-16%]"/>
        <Dots  className="pointer-events-none absolute right-8 top-14"/>
        <div className="pointer-events-none absolute bottom-0 left-20 top-0 w-px bg-gradient-to-b from-transparent via-[#C9A96E]/10 to-transparent"/>

        {/* Content */}
        <div className="relative px-10 py-28 md:px-20">
          <p className="mb-8 font-mono text-xs uppercase tracking-[0.14em] text-[#C9A96E]">
            AI Language Coach — Italian
          </p>
          <h1 className="max-w-3xl text-[68px] font-black leading-[1.02] tracking-[-3px] md:text-[88px]">
            Speak Italian<br/>with confidence.
          </h1>
          <p className="mt-9 max-w-lg text-lg font-light leading-8 text-[#8A8480]">
            A personal AI tutor that coaches you through real conversations,
            corrects your mistakes in context, and tracks your growth — session by session.
          </p>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              to={user ? "/playground" : "/register"}
              className="rounded-lg bg-[#C9A96E] px-8 py-4 text-[15px] font-bold text-[#0C0C0C] transition-opacity hover:opacity-90"
            >
              {user ? "Go to Playground" : "Start for free"}
            </Link>
            <button onClick={() => scrollTo("how")} className="rounded-lg border border-[#2A2A2A] px-8 py-4 text-[15px] text-[#8A8480] transition-colors hover:border-[#3A3A3A] hover:text-[#F0EDE8]">
              See how it works
            </button>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-6">
            {["No subscription required","Powered by Groq AI","Progress tracked automatically"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-[#C9A96E]"/>
                <span className="text-[13px] text-[#555150]">{t}</span>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* ══════════════════════════════════════
          SECTION 2 — HOW IT WORKS
      ══════════════════════════════════════ */}
      <section
        id="how"
        className="relative overflow-hidden border-t border-[#1E1E1E] px-10 py-24 md:px-20"
      >
        <Rings className="pointer-events-none absolute -bottom-56 -left-56"/>
        <Dots  className="pointer-events-none absolute bottom-10 left-8 opacity-60"/>
        <div className="pointer-events-none absolute bottom-0 right-24 top-0 w-px bg-gradient-to-b from-transparent via-[#C9A96E]/8 to-transparent"/>

        <div className="reveal relative mb-14 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-[#C9A96E]">How it works</p>
            <h2 className="text-5xl font-extrabold tracking-[-1.5px]">Three steps to fluency.</h2>
          </div>
          <p className="max-w-xs text-right text-[15px] leading-7 text-[#555150]">
            Each session is a focused, guided conversation. No grammar drills. No passive watching.
          </p>
        </div>

        <div className="reveal relative grid grid-cols-1 gap-0.5 md:grid-cols-3" style={{ transitionDelay: "0.1s" }}>
          {[
            { n: "01", title: "Pick a topic",          desc: "Choose from curated topics — food, travel, culture, current events. Edge surfaces topics matched to your level and interests.",                                                 r: "md:rounded-l-xl" },
            { n: "02", title: "Have a conversation",    desc: "Your AI coach guides you through the topic with questions, corrections, and encouragement. Type or speak — the coach responds naturally.",                                r: "" },
            { n: "03", title: "Review your progress",   desc: "After every session, a summary highlights your mistakes, strengths, and new vocabulary. Weekly reports show the bigger picture.",                                         r: "md:rounded-r-xl" },
          ].map((s) => (
            <div key={s.n} className={`flex flex-col gap-6 bg-[#111111] p-10 ${s.r}`}>
              <span className="font-mono text-4xl font-bold tracking-[-1px] text-[#2A2A2A]">{s.n}</span>
              <span className="text-[17px] font-semibold tracking-tight">{s.title}</span>
              <span className="text-sm leading-6 text-[#6B6866]">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <Marquee />

      {/* ══════════════════════════════════════
          SECTION 3 — FEATURES
      ══════════════════════════════════════ */}
      <section
        id="features"
        className="relative overflow-hidden border-t border-[#1E1E1E] px-10 py-24 md:px-20"
      >
        <Rings className="pointer-events-none absolute -right-56 -top-44"/>
        <Dots  className="pointer-events-none absolute right-10 top-10 opacity-70"/>
        <div className="pointer-events-none absolute bottom-0 left-32 top-0 w-px bg-gradient-to-b from-transparent via-[#C9A96E]/8 to-transparent"/>

        <div className="reveal relative mb-14">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-[#C9A96E]">Features</p>
          <h2 className="text-5xl font-extrabold tracking-[-1.5px]">
            Everything you need<br/>to actually improve.
          </h2>
        </div>

        <div className="reveal relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" style={{ transitionDelay: "0.1s" }}>
          {[
            { title: "AI Coaching",      Icon: IconChats,      desc: "Your coach responds in real time, gently corrects grammar and word choice, and keeps the conversation flowing naturally at your level." },
            { title: "Smart Flashcards", Icon: IconFlashcards, desc: "Vocabulary and grammar cards are automatically generated from your sessions. A spaced-repetition system surfaces the cards you need most." },
            { title: "Weekly Reports",   Icon: IconReports,    desc: "Recurring patterns in your mistakes, your strongest areas, vocabulary growth, and session consistency — all in one clear weekly digest." },
            { title: "Topic Discovery",  Icon: IconTopics,     desc: "Fresh conversation topics scraped from Italian news and culture every day. Always something relevant to talk about." },
          ].map((f) => (
            <div key={f.title} className="flex flex-col gap-4 rounded-xl border border-[#1E1E1E] p-9 transition-colors hover:border-[#2A2A2A] hover:bg-[#111111]/60">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1A1509]">
                <f.Icon/>
              </div>
              <p className="text-[17px] font-semibold tracking-tight">{f.title}</p>
              <p className="text-sm leading-6 text-[#6B6866]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 4 — QUOTE / PROGRESS
      ══════════════════════════════════════ */}
      <section
        id="progress"
        className="relative overflow-hidden border-t border-[#1E1E1E] px-10 py-24 md:px-20"
      >
        <Rings className="pointer-events-none absolute -bottom-56 -left-56"/>
        <div className="pointer-events-none absolute bottom-0 right-20 top-0 w-px bg-gradient-to-b from-transparent via-[#C9A96E]/8 to-transparent"/>

        <div className="reveal relative flex flex-col items-start gap-12 lg:flex-row lg:items-center lg:gap-20">
          <div className="flex flex-1 flex-col gap-7">
            <p className="text-3xl font-extrabold leading-tight tracking-[-1.2px] md:text-[40px] md:leading-[48px]">
              "The feedback is instant and honest. After three weeks I was holding conversations I couldn't have had before."
            </p>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E1E1E]">
                <span className="text-[15px] font-semibold text-[#C9A96E]">S</span>
              </div>
              <div>
                <p className="text-sm font-medium">Sara M.</p>
                <p className="text-[13px] text-[#555150]">B1 Italian learner, Cairo</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md flex-shrink-0 rounded-xl bg-[#111111] p-8">
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#C9A96E]">Session summary</p>
            <p className="mb-4 text-[15px] font-semibold">Il Mercato di Campo de' Fiori</p>
            <div className="mb-4 h-px bg-[#1E1E1E]"/>
            <div className="mb-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="min-w-[68px] pt-0.5 font-mono text-[11px] tracking-[0.06em] text-[#C9A96E]">MISTAKE</span>
                <span className="text-[13px] leading-5 text-[#6B6866]">
                  <span className="line-through">Ho andato al mercato</span>
                  {" → "}
                  <span className="font-medium text-[#F0EDE8]">Sono andato al mercato</span>
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="min-w-[68px] pt-0.5 font-mono text-[11px] tracking-[0.06em] text-[#5A8A5A]">STRENGTH</span>
                <span className="text-[13px] leading-5 text-[#6B6866]">
                  Natural use of <span className="font-medium text-[#F0EDE8]">qualcosa di fresco</span> — great collocations.
                </span>
              </div>
            </div>
            <div className="mb-4 h-px bg-[#1E1E1E]"/>
            <div className="flex justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#555150]">Score</p>
                <p className="text-2xl font-bold text-[#C9A96E]">8<span className="text-sm font-normal text-[#555150]">/10</span></p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#555150]">New cards</p>
                <p className="text-2xl font-bold">6</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 5 — CTA
      ══════════════════════════════════════ */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden border-t border-[#1E1E1E] px-10 py-28 text-center md:px-20"
      >
        <Rings className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50"/>

        <div className="reveal relative">
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.14em] text-[#C9A96E]">Begin today</p>
          <h2 className="mx-auto mb-5 max-w-2xl text-[60px] font-black leading-[1.05] tracking-[-2.5px] md:text-[72px]">
            Your next session is one click away.
          </h2>
          <p className="mx-auto mb-10 max-w-sm text-base leading-7 text-[#555150]">
            No fluency without practice. Edge makes practice effortless.
          </p>
          <Link
            to={user ? "/playground" : "/register"}
            className="inline-block rounded-lg bg-[#C9A96E] px-10 py-4 text-base font-bold text-[#0C0C0C] transition-opacity hover:opacity-90"
          >
            {user ? "Go to Playground" : "Start for free"}
          </Link>
        </div>
      </section>

    </div>
  );
}
