# Mobile Implementation Guide — Account & Feed Features

Implementation guide for building five features on a mobile client against the
**Edge Language Coach** stack (Supabase Auth + Fastify gateway).

> ### ⚠️ Scope note — this guide targets Edge Language Coach, not Sociaity
>
> These documents were requested for **Sociaity** (its backend and its website app). That
> codebase is not reachable from a session scoped to `ibrahemaskar11`, so the guide was
> written against **this** repository instead. It is accurate for Edge Language Coach and
> should not be handed to a Sociaity mobile engineer.
>
> To produce the Sociaity version, follow
> [`SOCIAITY-PORT-BRIEF.md`](./SOCIAITY-PORT-BRIEF.md) — it records what is blocked, how
> to unblock it, and the per-feature extraction checklist to run once the Sociaity
> backend and web repositories are in scope.

| # | Feature | Document | Exists today? |
|---|---------|----------|---------------|
| — | **Sociaity port brief — read first** | [`SOCIAITY-PORT-BRIEF.md`](./SOCIAITY-PORT-BRIEF.md) | — |
| 0 | **Open questions** | [`00-open-questions.md`](./00-open-questions.md) | — |
| 1 | Forgot Password | [`01-forgot-password.md`](./01-forgot-password.md) | ❌ Not built |
| 2 | Change Password | [`02-change-password.md`](./02-change-password.md) | ❌ Not built |
| 3 | Delete Account | [`03-delete-account.md`](./03-delete-account.md) | ❌ Not built |
| 4 | Deactivate Account | [`04-deactivate-account.md`](./04-deactivate-account.md) | ❌ Not built |
| 5 | Friends Suggestion in Feed | [`05-friends-suggestion-in-feed.md`](./05-friends-suggestion-in-feed.md) | ❌ Not built |

---

## Scope — read this before anything else

**None of these five features exist in this codebase yet.** Verified against the full
source tree: there is no password-reset flow, no password-change flow, no account
deletion or deactivation, and no social graph, feed, or friend suggestions of any kind.

What the codebase *does* have is a complete, consistent set of conventions for auth,
routing, error handling, data access, and client state. This guide:

1. **Documents those conventions** from the actual source, with file references, so the
   mobile client matches the web client — [Part 1](#part-1--conventions-as-they-exist-today).
2. **Specifies each feature** against those conventions — flows, states, the gateway
   routes and migrations that must be added, and the mobile client work.

So this is not "document what web already did". For these five features it is
"here is the house style, and here is what to build on both sides in that style."
Where a decision is genuinely open, it is marked ⚠️ CONFIRM and collected in
[`00-open-questions.md`](./00-open-questions.md).

### Markers

> **✅ VERIFIED** — Read directly from this repository. File reference given. Trust it.

> **⚠️ CONFIRM** — A product or backend decision that has not been made yet.

> **🆕 TO BUILD** — Does not exist. Server-side and/or client-side work required.

> **📱 MOBILE-ONLY** — No web counterpart; a platform constraint (deep links, store
> policy, background state).

> **🔒 SECURITY** — Non-negotiable.

---

# Part 1 — Conventions as they exist today

Everything in this part is ✅ VERIFIED against the source. Mirror it exactly.

## Architecture

```
  Mobile client                    Gateway (Fastify, :3001)         Supabase
 ┌──────────────┐                 ┌────────────────────────┐      ┌──────────┐
 │ supabase-sdk │──── auth ──────────────────────────────────────►│   Auth   │
 │              │                 │                        │      │          │
 │  HTTP client │──── /api/* ────►│ authPlugin (verify JWT) │─────►│ Postgres │
 └──────────────┘   Bearer JWT    │ rate limit (60/min)     │ svc  │  (RLS on)│
                                  │ routes                  │ role └──────────┘
                                  └────────────────────────┘
```

- Gateway: Fastify, port `3001` (`PORT`), all routes under `/api` —
  `apps/gateway/src/server.ts`
- Web client: Vite dev server proxies `/api` → `http://localhost:3001` —
  `apps/web/vite.config.ts:18-20`
- 📱 Mobile has no proxy. It must call the gateway's **absolute URL**, configured per
  environment. Add it as a build-time config value; do not hardcode localhost.

## 🔒 The single most important rule: never query Supabase tables directly

Row-Level Security is **enabled on every table with zero policies**
(`packages/db/prisma/migrations/enable_rls.sql`). The file says why, explicitly:

> the frontend never queries Supabase tables directly — it calls the gateway. So
> enabling RLS without any permissive policies has zero effect on the running
> application and closes the public anon-key access path.

Consequences for mobile:

| Use the Supabase SDK for | Never use the Supabase SDK for |
|--------------------------|-------------------------------|
| `auth.signInWithPassword` | `.from("profiles").select()` |
| `auth.signUp` | `.from(...)` anything |
| `auth.signOut` | any table read or write |
| `auth.getSession` / `onAuthStateChange` | |
| `auth.resetPasswordForEmail` (feature 1) | |
| `auth.updateUser` (features 1, 2) | |

Any `.from(...)` call from the mobile client will return **empty or error** under RLS.
If you find yourself wanting one, the answer is a new gateway route.

## Authentication

✅ Auth is **Supabase Auth, client-side**. The gateway does not issue tokens.

**Web client** — `apps/web/src/lib/auth.ts`:

- `signIn` → `supabase.auth.signInWithPassword({ email, password })` (line 38)
- `signUp` → `supabase.auth.signUp({ email, password })`, then `POST /api/auth/callback`
  to upsert the profile row (line 47)
- `signOut` → `supabase.auth.signOut()` (line 64)
- Session held in a zustand store, hydrated by `getSession()` and kept live by
  `onAuthStateChange` (lines 23–33)

**Gateway** — `apps/gateway/src/plugins/auth.ts`:

- `onRequest` hook on every request
- Requires `Authorization: Bearer <supabase access_token>`
- Missing/malformed header → `401 { "message": "Missing authorization" }` (line 31)
- Verifies with `supabase.auth.getUser(token)` (line 39)
- Invalid → `401 { "message": "Invalid token" }` (line 42)
- On success sets `request.userId` and `request.userEmail` (lines 45–46)

**Unauthenticated allowlist** (lines 19–24) — everything else requires a token:

```
/livez   /readyz   /metrics   /api/auth/callback   /api/breaker-demo   /admin
```

📱 **Mobile token storage.** The Supabase SDK persists the session for you, but check
where. On React Native it defaults to `AsyncStorage`, which is **not encrypted** — pass
a Keychain/Keystore-backed storage adapter explicitly. On Flutter/Swift/Kotlin SDKs,
confirm the same. 🔒 A refresh token in plaintext storage is a full account compromise
on a rooted or backed-up device.

## Error model

✅ Errors are `{ "message": string }` with an HTTP status. **There are no error codes.**

`apps/web/src/lib/api.ts:36`:

```ts
throw new Error(body.message || `API error: ${res.status}`);
```

Observed shapes:

| Source | Status | Body |
|--------|--------|------|
| `plugins/auth.ts:31` | `401` | `{ "message": "Missing authorization" }` |
| `plugins/auth.ts:42` | `401` | `{ "message": "Invalid token" }` |
| `routes/sessions.ts:16` | `400` | `{ "message": "Validation error", "errors": { "topicId": ["..."] } }` |
| `routes/sessions.ts:29` | `404` | `{ "message": "Topic not found" }` |
| any route, Supabase failure | `500` | `{ "message": "<supabase error message>" }` |
| `routes/admin.ts:8` | `401` | `{ "error": "unauthorized" }` ← **inconsistent, admin only** |
| `@fastify/rate-limit` | `429` | plugin default body + `Retry-After` |

> **🆕 TO BUILD — recommended.** Branching on `message` strings is fragile, and the
> features in this guide need it (feature 2 must distinguish "wrong current password"
> from "expired token" — both are `401`). Add a stable `code` field to the routes these
> features introduce:
>
> ```jsonc
> { "message": "Current password is incorrect.", "code": "INVALID_CREDENTIALS" }
> ```
>
> Additive, so it breaks no existing client. Every ⚠️ CONFIRM about error codes in this
> guide assumes you do this. If you don't, mobile must branch on status + message text,
> and 🔒 a wrong password will be indistinguishable from an expired session — which
> means spurious logouts.

📱 The `500` case leaks raw Supabase error messages to the client. Never render a `500`
`message` verbatim in mobile UI — show a generic error and log the detail.

## Rate limiting

✅ `apps/gateway/src/server.ts:66-79` — `@fastify/rate-limit`, Redis-backed:

- **60 requests per minute**, global
- Keyed by `request.userId`, falling back to `request.ip` (line 71)
- Registered **after** `authPlugin` so `userId` is populated — order matters
- Bypassed for `/livez`, `/readyz`, `/metrics`, `/api/breaker-demo`, `/admin`

📱 Consequences for mobile:

- 60/min is shared across the whole app for one user. A screen that fires several
  parallel requests on mount plus a pull-to-refresh can approach it. Batch where you can.
- Handle `429` globally in the HTTP client: read `Retry-After`, surface a cooldown,
  do not retry blindly in a loop.
- 🔒 Supabase Auth endpoints (`signInWithPassword`, `resetPasswordForEmail`,
  `updateUser`) do **not** pass through the gateway, so this limit does not protect
  them. They are rate limited by Supabase itself — ⚠️ CONFIRM the project's configured
  auth rate limits in the Supabase dashboard, since the defaults are generous.

## Request and response shape

✅ **Responses are camelCase.** Routes read snake_case from Postgres and convert with
`toCamelCase` (`apps/gateway/src/utils/camelcase.ts`), which recurses through arrays and
nested objects.

✅ **Requests are camelCase**, mapped to snake_case by hand inside each route — see
`routes/profile.ts` (`italianLevel` → `italian_level`).

✅ **Validation** uses Zod schemas shared from `@edge/shared`
(`packages/shared/src/schemas.ts`). Route pattern, `routes/sessions.ts:9-19`:

```ts
let body;
try {
  body = createSessionSchema.parse(request.body);
} catch (err) {
  if (err instanceof ZodError) {
    return reply.status(400)
      .send({ message: "Validation error", errors: err.flatten().fieldErrors });
  }
  throw err;
}
```

🆕 Any new route in this guide must follow it, and its input schema belongs in
`packages/shared/src/schemas.ts` so mobile can generate types from the same source.

✅ Status codes in use: `200` read/update, `201` create (`sessions.ts:43`),
`400` validation, `401` auth, `404` not found, `429` rate limit, `500` upstream failure.

## Client data layer

✅ Web uses TanStack Query. Mirror the **query keys** on mobile so cache invalidation
semantics stay comparable — `apps/web/src/hooks/use-api.ts`:

| Key | Hook | Notes |
|-----|------|-------|
| `["profile"]` | `useProfile` | `useUpdateProfile` writes via `setQueryData`, no refetch |
| `["topics"]`, `["topics", id]` | `useTopics` | |
| `["sessions"]`, `["sessions", id]` | `useSessions` | |
| `["stats"]` | `useStats` | invalidated by most mutations |
| `["flashcards", topicId, "due" \| "all"]` | | |
| `["recommendations"]` | `useRecommendedTopics` | `staleTime: 5 * 60 * 1000` |
| `["reports"]`, `["reports", weekId]` | | `staleTime: 5 * 60 * 1000` |
| `["placement-questions"]` | | `staleTime: Infinity` |

Mutations invalidate broadly — `useSendMessage` invalidates `messages`, `sessions`,
`sessions/:id`, and `stats`. Follow that habit: prefer over-invalidating to a stale UI.

## Route guarding

✅ `apps/web/src/routes/_authenticated.tsx` is the pattern to mirror:

1. Spinner while `authLoading || profileLoading`
2. No user → navigate to `/login` (line 21)
3. `profile.onboardingCompleted === false` → navigate to `/onboarding` (line 28)
4. Otherwise render

🆕 Features 3 and 4 add a step between 2 and 3: **if the profile is deactivated, route
to the reactivation prompt.** See [`04-deactivate-account.md`](./04-deactivate-account.md#reactivation).
Whoever owns the mobile route guard owns that change.

## Forms and feedback (web reference)

✅ For UX parity, the web conventions are:

- TanStack Form, validators on `onBlur` — `components/login-form.tsx:62-69`
- Field error rendered under the input, red text, only when
  `field.state.meta.isTouched`
- Submit button disabled while pending, spinner + verb inside it
  ("Signing in…") — lines 120-123
- Success and failure surfaced with `sonner` toasts: `toast.success("Welcome back!")`,
  `toast.error(error.message)` — lines 23, 27

📱 Mobile equivalents: inline field errors (not a dialog) for validation; a snackbar/
toast for submit-level outcomes; disabled button with inline spinner while pending.

## The `profiles` table

✅ `packages/db/prisma/schema.prisma`:

```prisma
model Profile {
  id                  String     @id @default(dbgenerated("gen_random_uuid()"))
  email               String     @unique
  fullName            String?    @map("full_name")
  dateOfBirth         DateTime?  @db.Date @map("date_of_birth")
  italianLevel        CefrLevel? @map("italian_level")
  onboardingCompleted Boolean    @default(false) @map("onboarding_completed")
  createdAt           DateTime   @default(now()) @map("created_at")
  updatedAt           DateTime   @default(now()) @updatedAt @map("updated_at")

  sessions       Session[]
  userTopics     UserTopic[]
  userFlashcards UserFlashcard[]
}
```

Note for features 3 and 4: **there is no `deactivated_at`, no `deleted_at`, and no
status column.** Both features require a migration. Also note `Profile.id` is *not* a
foreign key to `auth.users` in the Prisma schema — the link is by convention, set in
`routes/auth.ts` from `data.user.id`.

## Migrations

✅ Two conventions coexist:

- `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` — timestamped, applied via Supabase
- `packages/db/prisma/migrations/*.sql` — hand-run SQL (`enable_rls.sql` says "paste
  into the Supabase SQL Editor")

🆕 New migrations in this guide follow the `supabase/migrations/` timestamped form, and
the Prisma schema must be updated to match by hand — the two are kept in sync manually.

## Shared conventions for the mobile client

### Local wipe

Used by sign-out, delete, and deactivate. Write it **once** and call it from all three —
a partial wipe that leaves cached data on disk is a privacy bug.

1. `supabase.auth.signOut()`
2. In-memory stores (the auth store equivalent, any feature stores)
3. Query cache — `clear()`, not just invalidate
4. Secure storage (Supabase session, any biometric flags)
5. Key-value prefs (onboarding flags, dismissed suggestions, drafts)
6. Disk caches: image cache, offline DB, downloaded audio
7. 📱 Push token — deregister server-side **first**, then clear locally
8. Analytics identity — `reset()`

Then reset navigation to the logged-out stack so back cannot re-enter authenticated
screens.

### Password policy

⚠️ CONFIRM — **there is no password validation in this codebase.** The login form checks
only that the field is non-empty (`login-form.tsx:94-96`), and `signUp` passes the password
straight to Supabase. So the *effective* policy today is Supabase's default: **minimum 6
characters**, nothing else.

That is weak for an account that owns personal learning data. Recommendation:

- Raise the minimum in the Supabase dashboard (Auth → Policies) to **8+**
- Enable Supabase's leaked-password protection (HaveIBeenPwned check) if available on
  the project's plan
- Add a shared Zod `passwordSchema` in `packages/shared/src/schemas.ts` so web and
  mobile validate identically

🔒 Whatever is chosen, mobile and web must enforce the *same* rule. Client validation is
UX; Supabase remains authoritative.

### Offline behavior

None of these five features work offline. Show an offline state rather than letting a
request hang, and 🔒 never queue a password change, deletion, or deactivation for later
replay — a security action replayed at an unknown future time is a bug.

### Accessibility

Labels on all interactive elements (icon-only buttons especially); 44×44pt / 48×48dp
minimum targets; errors announced to screen readers, not signalled by color alone;
layouts that survive the largest system font size; `secureTextEntry` with a labeled
visibility toggle on password fields.

### Analytics

⚠️ CONFIRM — **no analytics library is present in this codebase.** The events listed in
each feature document are a proposal for whatever mobile adopts, not a mirror of
existing web events. If web later adds analytics, align names then.
