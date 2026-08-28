# 4. Deactivate Account

**Status:** 🆕 Not built. Requires a migration, a gateway route, and an `authPlugin` change.
**Auth state:** Logged in + re-authentication
**Pairs with:** [Delete Account](./03-delete-account.md)

---

## Purpose

Temporarily suspends the account without destroying data. The user restores it by
signing in again.

---

## What already exists

✅ VERIFIED — nothing. No status column on `profiles`, no settings surface, and no
concept of a suspended user anywhere in the gateway or web client.

---

## Semantics in *this* product

Most deactivation guidance assumes a social product where the main question is "what do
other users see". **This app has no social surface** — no feed, no friends, no shared
content. Every table is either the user's own data (`sessions`, `messages`, `feedback`,
`user_topics`, `user_flashcards`) or shared catalogue data (`topics`, `flashcards`,
`placement_questions`).

That makes deactivation here much simpler than the usual case, and worth stating plainly
so nobody builds machinery for a problem this product doesn't have:

| Question | Answer for this codebase |
|----------|--------------------------|
| Is the profile hidden from others? | No "others" exist. N/A |
| Do posts/comments disappear? | No such content. N/A |
| Are friendships severed? | No friendships. N/A — until [feature 5](./05-friends-suggestion-in-feed.md) ships |
| What actually happens? | The user cannot sign in or use the API; their data is preserved untouched |
| Are background jobs suppressed? | ⚠️ CONFIRM — see [Workers](#workers) |
| Are emails suppressed? | ⚠️ CONFIRM — no email sending exists in this codebase today beyond Supabase Auth |

> **If [feature 5](./05-friends-suggestion-in-feed.md) ships, revisit this document.**
> A social graph turns every N/A above into real work, and deactivated users must then
> be excluded from suggestions and rendered as placeholders everywhere a person appears.
> That section is written up in feature 5; cross-reference it then.

---

## Migration 🆕

Repo convention — `supabase/migrations/<timestamp>_<name>.sql`:

```sql
-- supabase/migrations/<YYYYMMDDHHMMSS>_add_profile_deactivation.sql
ALTER TABLE profiles ADD COLUMN deactivated_at timestamptz;
CREATE INDEX profiles_deactivated_at_idx
  ON profiles (deactivated_at) WHERE deactivated_at IS NOT NULL;
```

And by hand in `packages/db/prisma/schema.prisma` (the two are synced manually):

```prisma
deactivatedAt DateTime? @map("deactivated_at")
```

A nullable timestamp beats a boolean: it records *when*, which the reactivation screen
and any auto-purge policy both need. This is the same shape [feature 3](./03-delete-account.md#migration-option-b-only)
uses for `deleted_at` — do them in one migration if both are being built.

---

## 🔒 Enforcement — the part that is easy to get wrong

Deactivation is meaningless unless the API rejects deactivated users. Today
`apps/gateway/src/plugins/auth.ts` checks only that the Supabase token is valid
(lines 28-46) — a deactivated user's token stays valid, so **every route would keep
working**.

🆕 Add the check to `authPlugin`, so it applies to all routes at once rather than being
re-implemented per route:

```ts
// apps/gateway/src/plugins/auth.ts — after request.userId is set (line 45)
const { data: profile } = await fastify.supabase
  .from("profiles")
  .select("deactivated_at")
  .eq("id", user.id)
  .single();

if (profile?.deactivated_at) {
  return reply.status(403).send({
    message: "Account is deactivated.",
    code: "ACCOUNT_DEACTIVATED",
    deactivatedAt: profile.deactivated_at,
  });
}
```

Two consequences to handle deliberately:

1. **This adds a database round trip to every request**, on top of the
   `supabase.auth.getUser(token)` network call already there (line 39). ⚠️ CONFIRM
   whether that is acceptable, or whether the flag should be cached — Redis is already
   available (`apps/gateway/src/lib/queues.ts` exports the connection, and the rate
   limiter uses it at `server.ts:70`), so a short-TTL cache keyed by user id is a small
   change. Measure before optimizing; `httpRequestDuration` is already instrumented
   (`server.ts:47-52`).

2. **The reactivate route must bypass the check**, or the user can never come back. Add
   it to the same allowlist pattern used at `plugins/auth.ts:19-24`, or check the path
   before the profile lookup.

---

## Entry points

| Location | Control |
|----------|---------|
| Settings → Account | "Deactivate account", **above** "Delete account" |
| [Delete Account](./03-delete-account.md) [A] | "Just need a break? Deactivate instead" |

Style it as cautionary, not destructive. Reserve red for delete.

---

## Flow

```
Settings ──► [A] What happens ──► [B] Re-auth ──► [C] Confirm
                                                       │
                                                       ▼
                                          [D] Processing → local wipe → logged out
```

Three screens, not four. The lower friction relative to delete is intentional and
correct — the action is reversible.

### [A] "What happens"

> **Deactivate your account**
>
> While your account is deactivated:
> - You won't be able to sign in or start speaking sessions
> - You won't receive any emails from us
>
> Your sessions, transcripts, feedback, flashcard progress, and reports are all kept.
> **Sign in again any time to pick up exactly where you left off.**

Contrast with deletion in one line: "Want to remove your data permanently instead?
Delete your account."

⚠️ CONFIRM whether a **duration** is offered ("1 week / 1 month / until I come back").
If yes, it needs a scheduled reactivation job — the BullMQ setup in `apps/workers/` can
carry it. If not, omit it; don't invent it.

### [B] Re-authenticate

🔒 Required, same mechanism as [feature 2](./02-change-password.md). Deactivation is an
availability attack if a borrowed unlocked phone can trigger it.

### [C] Confirm

Single standard confirmation — no typed word, no hold gesture. Reversible actions do not
warrant that friction.

Optional reason picker, skippable.

### [D] Processing and sign-out

- Full [local wipe](./README.md#local-wipe) — identical to sign-out.
- Reset navigation to the logged-out stack.
- Confirmation: "Your account is deactivated. Sign in any time to restore it."

On failure: error + retry, no wipe.

---

## Reactivation

📱 This is a **login-flow change**, and the part most likely to be missed at scoping.
Whoever owns the login screen owns it.

```
Login ──► signInWithPassword succeeds
             │
             ▼
      profile deactivated?
             │yes
             ▼
   [R] Reactivate prompt ──confirm──► POST /api/account/reactivate ──► main app
             │
             └──"Not now"──► signOut() — still deactivated
```

### How the client finds out

Supabase's `signInWithPassword` succeeds regardless — it knows nothing about
`profiles.deactivated_at`. So the client discovers the state on its **first gateway
call**, which returns the `403 ACCOUNT_DEACTIVATED` from the `authPlugin` check above.

The natural place is the existing profile fetch. The web guard already calls
`useProfile()` before rendering (`apps/web/src/routes/_authenticated.tsx:17`), so the
mobile guard should mirror it and add one branch:

```
authLoading || profileLoading            → spinner        (existing, lines 33-40)
no user                                  → /login         (existing, lines 20-22)
profile fetch returned ACCOUNT_DEACTIVATED → [R]          🆕
!profile.onboardingCompleted             → /onboarding    (existing, lines 26-30)
otherwise                                → render
```

⚠️ CONFIRM that `/api/profile` is the right probe, or whether a dedicated lightweight
`GET /api/account/status` is preferable — the profile route currently selects only
`italian_level, onboarding_completed` (`apps/gateway/src/routes/profile.ts`) and would
need to surface the deactivation state too.

### [R] Reactivate prompt

> **Welcome back**
> Your account is deactivated. Reactivating restores your sessions, flashcards, and
> progress.
> `[Reactivate my account]`   `[Not now]`

⚠️ CONFIRM explicit (recommended) vs implicit reactivation. **Explicit** means the user
confirms; **implicit** means signing in silently reactivates. Implicit is simpler
backend work but undoes a deliberate decision for anyone who opens the app out of habit.
Recommend explicit.

"Not now" → `signOut()` + local wipe.

🔒 Reactivation requires a successful sign-in first. It is never reachable
unauthenticated.

### After reactivation

- Clear and refetch the query cache — the account's API access just changed globally, so
  every cached value is suspect.
- Route into the app, honoring the existing onboarding redirect.

---

## API contract 🆕

### Deactivate

```http
POST /api/account/deactivate
Authorization: Bearer <supabase access_token>

{ "password": "...", "reason": "TAKING_A_BREAK" }
```

Route sets `profiles.deactivated_at = now()` after verifying the password, then
🔒 revokes sessions with `supabase.auth.admin.signOut(userId, "global")` so other
devices drop immediately rather than waiting for the `403`.

| Status | Body | Client |
|--------|------|--------|
| `200` | `{ "ok": true, "deactivatedAt": "..." }` | Wipe + sign out |
| `401` | `{ "message": "...", "code": "INVALID_CREDENTIALS" }` | Inline on password |
| `409` | `{ "message": "Already deactivated" }` | Treat as success |

### Reactivate

```http
POST /api/account/reactivate
Authorization: Bearer <supabase access_token>
```

🔒 **This route must bypass the `authPlugin` deactivation check** — otherwise it is
unreachable. It still requires a valid token.

Sets `deactivated_at = NULL`. Returns `{ "ok": true }`.

Schemas go in `packages/shared/src/schemas.ts` alongside the existing ones.

---

## Workers

⚠️ CONFIRM behavior for the BullMQ jobs in `apps/workers/src/workers/` —
`summary.worker.ts` and `flashcard.worker.ts` process work for a user's sessions.

If a user deactivates while a job is queued, it will still run and write rows for a
deactivated account. Probably harmless (the data is preserved anyway), but decide
explicitly rather than by accident. The `scraper.worker.ts` job is global and unaffected.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Another device is signed in | 🔒 `admin.signOut(userId, "global")` drops it immediately. Without that, it keeps working until its token expires |
| Password reset while deactivated | ⚠️ CONFIRM — the Supabase reset succeeds (it doesn't consult `profiles`), and the user then hits [R] on next sign-in. That is reasonable; confirm it's intended |
| Deactivate, then want to delete | Requires signing in → [R]. ⚠️ CONFIRM the reactivate-then-delete path works, or allow deletion directly from [R] |
| `409 Already deactivated` | Treated as success |
| App killed during [D] | Next launch → token invalid or `403` → correct state |
| Deactivated user's queued job completes | See [Workers](#workers) |
| Deactivation flag cached in Redis, user reactivates | 🔒 Invalidate the cache key on reactivate, or the user stays locked out for the TTL |
| Onboarding incomplete when reactivating | Existing guard sends them to `/onboarding` |

---

## Security requirements

🔒 Mandatory:

1. **Enforced in `authPlugin`**, not per route — one check, no gaps.
2. **Reactivate route explicitly bypasses** that check, and nothing else does.
3. **Re-authentication required** to deactivate.
4. **All sessions revoked** on deactivation.
5. **Complete local wipe**, identical to sign-out.
6. **Cache invalidation on reactivate**, if the flag is cached.
7. **Confirmation email** with restore instructions. ⚠️ CONFIRM.

---

## Work breakdown

| Task | Owner | Blocking? |
|------|-------|-----------|
| `deactivated_at` migration + Prisma sync | Backend | 🔴 Yes |
| `authPlugin` enforcement + reactivate bypass | Gateway | 🔴 Yes |
| `POST /api/account/deactivate` + `/reactivate` | Gateway | 🔴 Yes |
| Decide explicit vs implicit reactivation | Product | 🔴 Yes |
| Expose deactivation state on `/api/profile` (or a status route) | Gateway | 🔴 Yes |
| Settings screen / IA (shared with features 2, 3) | Design + Mobile | 🔴 Yes |
| Decide the per-request lookup vs Redis cache | Backend | 🟡 Soon |
| Duration option + scheduled reactivation job | Product + Workers | 🟡 If wanted |
| Screens [A]–[D] and [R] | Mobile | |
| Route-guard branch for [R] | Mobile | |

---

## Acceptance checklist

- [ ] 🔒 A deactivated user's token is rejected by **every** `/api` route
- [ ] 🔒 The reactivate route still works while deactivated
- [ ] Re-authentication enforced
- [ ] [A] describes what this product actually does — no borrowed social-app copy
- [ ] Delete is offered as the alternative, and vice versa
- [ ] Success performs a complete local wipe
- [ ] Other devices are signed out immediately, not after token expiry
- [ ] Signing in shows [R], not a generic error screen
- [ ] "Not now" leaves the account deactivated
- [ ] Reactivation restores access and clears the query cache
- [ ] Reactivating honors the existing onboarding redirect
- [ ] Redis cache (if used) is invalidated on reactivate
- [ ] Confirmation email arrives
- [ ] Queued worker jobs behave per the confirmed policy
