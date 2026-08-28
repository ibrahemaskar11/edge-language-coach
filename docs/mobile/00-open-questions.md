# 00. Open Questions — resolve before implementation

Every `⚠️ CONFIRM` in this guide, in one place.

The first version of this checklist had 61 items. **Reading the codebase answered 30 of
them** — those are now recorded as ✅ facts in the guide rather than questions. What
remains below are genuine decisions nobody has made yet, plus a few settings that live
in the Supabase dashboard rather than in the repository.

Fill in **Answer** and check the box. An unchecked row is a known unknown, not a detail
to work out during coding.

---

## 🔴 Blocking — nothing ships until these are decided

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 1 | **Is there a settings surface at all?** None exists — no `/settings` route, no account section in the sidebar. Features 2, 3, and 4 all live in one, so its IA is a shared prerequisite | Design | |
| 2 | **Hard delete or soft delete with a grace period?** Changes schema, route, copy, and whether a purge worker is needed. [Recommendation: hard delete](./03-delete-account.md#-confirm-first-hard-delete-or-soft-delete) | Product | |
| 3 | **How does a client distinguish "wrong password" from "expired token"?** `authPlugin` already returns `401` for expired tokens (`plugins/auth.ts:42`). Without a `code` field or a `403`, a typo signs the user out | Backend | |
| 4 | **Re-auth mechanism.** Supabase's `updateUser` does not verify the current password. [Option A vs B](./02-change-password.md#-the-critical-gap-supabase-does-not-verify-the-current-password) — recommend B, gateway-verified | Backend | |
| 5 | **Custom scheme or universal links** for the password-reset deep link? Universal links need `apple-app-site-association` + `assetlinks.json` on the Vercel domain — infra work owned outside mobile | Product + Infra | |
| 6 | **Supabase redirect-URL allowlist** entries for web dev, web prod, and mobile. A `redirectTo` not on the list is silently ignored | Backend | |
| 7 | **Is PKCE flow enabled** on the Supabase project? 🔒 Required so recovery tokens don't ride in URL fragments | Backend | |
| 8 | **Explicit or implicit reactivation** after deactivation? [Recommend explicit](./04-deactivate-account.md#r-reactivate-prompt) | Product | |
| 9 | **Does this product have a social graph at all?** Feature 5 is a new product surface, not a port. Everything in that document is downstream of this | Product | |
| 10 | **Privacy review:** exposing `fullName` and `italianLevel` to other users changes what sign-up consented to | Product + Legal | |
| 11 | **Does "feed" mean the Playground dashboard?** It is the only candidate surface | Product + Design | |
| 12 | **The gateway's absolute URL per environment** for mobile. Web relies on a Vite proxy (`vite.config.ts:18-20`); mobile has no proxy | Backend/Infra | |

## 🟡 Needed soon — decide during the build

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 13 | **Password policy.** There is none in the codebase; the effective rule is Supabase's 6-character default. Raise it, and add a shared `passwordSchema` to `@edge/shared` | Product + Backend | |
| 14 | Enable Supabase leaked-password protection? | Backend | |
| 15 | Supabase **auth rate limits** for the project (reset emails, sign-in attempts) — the gateway's 60/min does not cover Supabase-direct calls | Backend | |
| 16 | Recovery-token **TTL** (Supabase default 1 hour) — [B] copy must state it accurately | Backend | |
| 17 | **Are other sessions revoked** on password reset and on password change? Supabase's default may not; if not, add an `auth.admin.signOut` call | Backend | |
| 18 | `signOut` scope supported by the installed SDK version — `"others"` vs `"global"` | Backend | |
| 19 | **Confirmation emails** for password change, deletion, and deactivation. None exist today | Backend | |
| 20 | Which **Supabase Storage bucket** holds `Session.audioUrl`? Deletion must remove those objects before the rows that name them | Backend | |
| 21 | Add **`ON DELETE CASCADE`** to user-owned relations? Would make [deletion order](./03-delete-account.md#deletion-order) a non-issue permanently | Backend | |
| 22 | Wrap deletion in a **transactional RPC**? The JS client has no transaction API, so partial failure is possible | Backend | |
| 23 | Deactivation check in `authPlugin`: **per-request DB lookup or Redis cache?** Redis is already wired up for rate limiting | Backend | |
| 24 | Expose deactivation state on `/api/profile`, or add `GET /api/account/status`? | Backend | |
| 25 | **Queued BullMQ jobs** for a user who deactivates or deletes mid-flight — cancel, or let them complete? | Backend | |
| 26 | Re-registering with the same email after deletion — allowed? | Product | |
| 27 | **Reason lists** for delete and deactivate | Product | |
| 28 | Final-confirmation word for deletion, and 🔒 **its localization** — the audience is non-Italian speakers learning Italian | Product | |
| 29 | Is a **data export** wanted before deletion? `/api/reports` already aggregates most of it | Product | |
| 30 | Is a **deactivation duration** offered ("1 week / 1 month")? Needs a scheduled job | Product | |
| 31 | Behavior when a **deactivated user resets their password** — currently would succeed and hit the reactivation prompt on next sign-in | Product | |
| 32 | **Deactivate → delete** path: reactivate first, or allow deletion straight from the prompt? | Product | |
| 33 | Password **Unicode normalization** — keep client input unmodified and confirm Supabase's handling | Backend | |
| 34 | Is **OAuth sign-in** planned? Decides whether "Set password" branches are real or dead code | Product | |

## 🟢 Feature 5 only — after question 9 is answered

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 35 | Scoring **signal weights** for suggestions (same level, adjacent level, shared topics, mutual friends, recency) | Product | |
| 36 | Which **fields** may a suggestion payload expose? 🔒 Never `email` | Product + Legal | |
| 37 | Do designs need **avatars**? No avatar column exists on `profiles` | Design | |
| 38 | Section **placement and copy** on the dashboard — "People you may know" implies a social network this product may not be | Design | |
| 39 | Minimum suggestion count below which the section is hidden (suggest 3) | Design | |
| 40 | After adding — card stays as `Requested`, or animates out? | Design | |
| 41 | **"Don't suggest me to others"** setting — 🔒 should exist from day one | Product | |
| 42 | May **mutual friends' names or avatars** be shown, or only a count? | Product + Legal | |
| 43 | Is a **notification system** in scope? Without one, an accepted friend request is only discoverable by chance | Product | |
| 44 | Extract `cefrDistance()` (`routes/recommendations.ts:13`) to a shared util, or duplicate it? | Backend | |
| 45 | Do analytics exist anywhere? **No library is present in this codebase** — the event names in this guide are proposals | Product | |

---

## What the codebase already answered

Recorded so nobody re-asks. All ✅ VERIFIED, with references in
[`README.md`](./README.md#part-1--conventions-as-they-exist-today).

| Answered | Value |
|----------|-------|
| Error envelope | `{ "message": string }`, plus `errors` on Zod `400`s. **No error codes anywhere** |
| Auth mechanism | Supabase Auth client-side; gateway verifies `Bearer` via `supabase.auth.getUser` |
| Unauthenticated routes | `/livez`, `/readyz`, `/metrics`, `/api/auth/callback`, `/api/breaker-demo`, `/admin` |
| Rate limiting | 60/min global, keyed `userId \|\| ip`, Redis-backed |
| Case convention | camelCase both ways; `toCamelCase` on responses, manual mapping on requests |
| Validation | Zod from `@edge/shared`; `400 { message: "Validation error", errors }` |
| Status codes | `200` / `201` / `400` / `401` / `404` / `429` / `500` |
| Data access | 🔒 RLS on, zero policies — **mobile must never query Supabase tables**, only `auth.*` |
| Client cache | TanStack Query; key list and `staleTime` values documented in the README |
| Route guard | Spinner → `/login` → `/onboarding` → render |
| Form conventions | TanStack Form, blur validators, inline red errors, disabled submit + spinner, `sonner` toasts |
| `profiles` columns | No `deleted_at`, no `deactivated_at`, no status column |
| Cascade rules | **None** — no relation declares `onDelete`, so deletion order is mandatory |
| Migration convention | `supabase/migrations/<timestamp>_<name>.sql`, Prisma schema synced by hand |
| Ranked-list precedent | `/api/recommendations` — scoring, sorting, re-order-after-`IN`, fallback `try/catch` |
| Feed | Does not exist. Closest surface is the Playground dashboard |
| Social graph | Does not exist. No relation between two `Profile` rows anywhere |
| Analytics | No library present |
| Password validation | None beyond "not empty" on the login form |
