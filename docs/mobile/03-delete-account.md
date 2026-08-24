# 3. Delete Account

**Status:** 🆕 Not built. Requires a gateway route and a decision on soft vs hard delete.
**Auth state:** Logged in + re-authentication
**Pairs with:** [Deactivate Account](./04-deactivate-account.md) — read both together

---

## Purpose

Permanently removes the user's account and their learning data.

📱 **This is a store requirement, not a product nice-to-have:**

- **Apple** — App Store Review Guideline **5.1.1(v)**: an app supporting account
  creation must let the user **initiate deletion from within the app**. A link to a
  website is not sufficient on its own.
- **Google Play** — the **Data deletion** policy requires an in-app path *and* a publicly
  reachable web URL, both declared in the Data safety form.

The web app has no deletion path at all today, so mobile cannot copy one. Mobile will
likely ship this **before** web does, driven by review deadlines. Plan for that: the
gateway route below is shared, so build it once and let web adopt it later.

---

## What already exists

✅ VERIFIED — nothing. Specifically:

- No settings surface (see [feature 2](./02-change-password.md#what-already-exists)).
- No `deleted_at` or status column on `profiles`
  (`packages/db/prisma/schema.prisma`).
- No cascade rules: **no relation in the Prisma schema declares `onDelete`**, so Postgres
  uses the default (`NO ACTION`). Deleting a profile row while sessions reference it
  will **fail with a foreign-key violation**. Deletion order is therefore mandatory, not
  an optimization — see [Deletion order](#deletion-order).
- `apps/gateway/src/plugins/supabase.ts` creates a **service-role** client, which is
  exactly what `auth.admin.deleteUser` requires. That part is ready.

---

## Delete vs. deactivate

Settle this before writing code.

| | Deactivate | Delete |
|---|---|---|
| Reversible | Yes | No (or only within a grace period) |
| Data retained | Yes, hidden | No |
| Sessions, flashcards, reports | Preserved | Removed |
| Recovery | Sign in again | Not possible after the grace period |

The delete screen must **offer deactivation as an alternative** before the user commits.

---

## ⚠️ CONFIRM first: hard delete or soft delete?

This changes the schema, the route, and the copy. It is the top blocking decision.

**Option A — hard delete.** Rows removed, `auth.users` entry deleted. Truthful "this
cannot be undone" copy. No recovery. Simplest to reason about and to defend in a privacy
review.

**Option B — soft delete with a grace period.** Add `deleted_at` to `profiles`, hide the
account everywhere, and purge with a scheduled job after N days. Requires:

- A migration (below)
- A guard change so a soft-deleted user cannot use the app
- 🆕 A purge job. Note `apps/workers/` already runs BullMQ workers
  (`apps/workers/src/workers/`) — a repeatable purge job fits that existing pattern
  rather than needing new infrastructure.

Recommendation: **Option A** unless product actively wants recovery. This app stores
learning history, not irreplaceable user-generated content shared with others, and
Option B's purge job is real ongoing work.

Everything below covers both; branches are marked.

---

## Deletion order

🔒 Because no `onDelete` cascade exists, the route must delete in dependency order. Derived
from `packages/db/prisma/schema.prisma`:

```
1. messages        WHERE session_id IN (user's sessions)   -- Message.sessionId → Session
2. feedback        WHERE session_id IN (user's sessions)   -- Feedback.sessionId → Session
3. sessions        WHERE user_id = :userId                 -- Session.userId → Profile
4. user_flashcards WHERE user_id = :userId                 -- UserFlashcard.userId → Profile
5. user_topics     WHERE user_id = :userId                 -- UserTopic.userId → Profile
6. profiles        WHERE id = :userId
7. auth.users      via supabase.auth.admin.deleteUser(userId)
```

Not touched — these are shared catalogue data, not user data: `topics`, `flashcards`,
`placement_questions`.

🆕 **Also delete stored audio.** `Session.audioUrl` points at recorded speech — the most
sensitive data this app holds. ⚠️ CONFIRM which Supabase Storage bucket it uses, then
remove those objects **before** step 3, while the rows still name them. Deleting the rows
first orphans the files permanently.

> **Strongly recommended 🆕:** add `ON DELETE CASCADE` to the user-owned relations so
> this ordering stops being a correctness risk that every future contributor must
> remember. That is a migration plus `onDelete: Cascade` in the Prisma schema, and it
> makes steps 1–5 a single `DELETE FROM profiles`.

---

## Migration (Option B only)

Following the repo convention `supabase/migrations/<timestamp>_<name>.sql`:

```sql
-- supabase/migrations/<YYYYMMDDHHMMSS>_add_profile_lifecycle.sql
ALTER TABLE profiles ADD COLUMN deleted_at timestamptz;
CREATE INDEX profiles_deleted_at_idx ON profiles (deleted_at) WHERE deleted_at IS NOT NULL;
```

Then update `packages/db/prisma/schema.prisma` by hand to match — the two are kept in
sync manually in this repo:

```prisma
deletedAt DateTime? @map("deleted_at")
```

---

## Gateway route 🆕

```ts
// apps/gateway/src/routes/account.ts
fastify.delete("/api/account", async (request, reply) => {
  // 1. Re-authenticate — see feature 2 for why the session alone is not enough.
  const check = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { error: authError } = await check.auth.signInWithPassword({
    email: request.userEmail,
    password: body.password,
  });
  if (authError) {
    return reply.status(401)
      .send({ message: "Password is incorrect.", code: "INVALID_CREDENTIALS" });
  }

  // 2. Delete in dependency order (see above), or set deleted_at for Option B.
  // 3. supabase.auth.admin.deleteUser(request.userId)
  return reply.send({ ok: true });
});
```

🔒 The route must be **idempotent** — a retry after a dropped connection must return
`200`, not a confusing `404`. Mobile networks drop requests; this will happen.

🔒 It must also be **atomic enough**. The Supabase JS client has no transaction API, so a
failure at step 4 leaves the account half-deleted. ⚠️ CONFIRM the approach: a Postgres
function invoked via `supabase.rpc()` that wraps steps 1–6 in one transaction is the
clean fix, and is worth the extra work here.

---

## Flow

```
Settings ──► [A] What happens ──► [B] Re-auth ──► [C] Reason (optional)
                                                        │
                                                        ▼
                                              [D] Final confirmation
                                                        │
                                                        ▼
                                              [E] Processing → local wipe → logged out
```

Four screens for an irreversible action is correct. Do not compress it into one alert.

### [A] "What happens"

Be specific. Name the actual data this app holds — generic warnings read as boilerplate
and users click through them.

> **Delete your account**
>
> This will permanently remove:
> - Your profile and level
> - All your speaking sessions and their recordings
> - All transcripts, coaching feedback, and conversation history
> - Your flashcard progress and review history
> - Your weekly reports
>
> **This cannot be undone.**
> *(Option B: "You can restore your account by signing in within 30 days.")*

Also on this screen:

- **"Just need a break? Deactivate instead"** → [feature 4](./04-deactivate-account.md).
- ⚠️ CONFIRM whether a data export exists or is wanted. There is none today; for a
  language-learning history this is a reasonable thing to offer, and cheap to add given
  `/api/reports` already aggregates it.
- ⚠️ CONFIRM subscriptions. This app has no billing today. 📱 If in-app purchases are
  ever added, deleting the account does **not** cancel an Apple/Google subscription —
  the screen must say so and deep link to store subscription management.

### [B] Re-authenticate

🔒 Mandatory. Same mechanism as [feature 2](./02-change-password.md), and the same
reason: an unattended unlocked phone must not be able to delete the account.

Errors are inline on the password field. 🔒 A failed attempt here must be rate limited —
this endpoint is a password oracle otherwise.

### [C] Reason (optional)

Single-select plus optional free text, genuinely skippable ("Skip" of equal weight).
🔒 Never block deletion on a reason. ⚠️ CONFIRM the reason list with product; there is no
existing set to mirror.

### [D] Final confirmation

Requires a deliberate, non-accidental action:

- **Typed confirmation** — the user types `DELETE`. ⚠️ CONFIRM the word, and 🔒 **localize
  it** — the app teaches Italian to non-Italian speakers, so a forced English word is a
  real accessibility problem for part of the audience.
- Or **hold-to-confirm** (~3s). Slicker, but harder with motor impairments; provide a
  typed fallback if used.

Never a plain two-button alert.

### [E] Processing

- Full-screen, non-dismissable, back navigation disabled.
- On success → [local wipe](./README.md#local-wipe) → reset navigation to the logged-out
  stack.
- On failure → error + Retry. 🔒 **Do not wipe** — the account still exists.

📱 Deregister the push token before or as part of deletion. A deleted account whose
device still receives notifications is a privacy incident. (No push exists in this
codebase yet; wire it in when push is added.)

---

## Client state

- Success → full [local wipe](./README.md#local-wipe), every item on that list. Cached
  transcripts and audio on disk are the sensitive part.
- Reset the navigation stack so authenticated screens are unreachable via back.
- Reset the analytics identity after emitting the final event.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| FK violation mid-delete | 🔒 Must not happen — enforced by [deletion order](#deletion-order) or cascades. Test with a user who has sessions, messages, feedback, flashcards, and topics |
| Network drops during [E] | Retry. The route must be idempotent |
| Retry after partial deletion | Succeeds and completes the remainder |
| Audio files in Storage | Removed. Verify the bucket is empty for that user afterwards |
| Another device signed in | Its next request hits `authPlugin:39`, `getUser` fails → `401 { "message": "Invalid token" }` → forced sign-out. ✅ Works today with no extra work |
| Re-registering with the same email | ⚠️ CONFIRM. Hard delete frees the `profiles.email` unique constraint, so a fresh account is possible. Under Option B the row still exists and `signUp` will fail on the unique index — that must be handled |
| Deleting while a coaching session is `coaching` | Session rows are deleted; any queued BullMQ job for that session will fail. ⚠️ CONFIRM whether queued summary/flashcard jobs should be cancelled first (`apps/workers/src/workers/`) |
| App killed during [E] | Next launch: token invalid → forced sign-out → clean state |
| Account already deactivated | ⚠️ CONFIRM: deletion should remain reachable |

---

## Security requirements

🔒 Mandatory:

1. **Re-authentication verified server-side**, never a local-only check.
2. **Rate limited** on the password check.
3. **Idempotent** so retries are safe.
4. **Transactional**, or with a documented, tested recovery path for partial failure.
5. **Audio and transcripts removed**, including Storage objects — this is the most
   sensitive data in the product.
6. **All sessions invalidated** — ✅ automatic once `auth.users` is deleted.
7. **Complete local wipe** on the device.
8. **Confirmation email** on deletion. ⚠️ CONFIRM — the account owner's only signal if the
   deletion was unauthorized. Under Option B it must carry the recovery deadline.
9. **Truthful copy** — [A] must describe what the backend actually does. Do not promise
   erasure if Option B retains rows for 30 days.

---

## Work breakdown

| Task | Owner | Blocking? |
|------|-------|-----------|
| Decide hard vs soft delete | Product | 🔴 Yes |
| Settings screen / IA | Design + Mobile | 🔴 Yes |
| `DELETE /api/account` route + deletion order | Gateway | 🔴 Yes |
| Re-auth mechanism (shared with feature 2) | Gateway | 🔴 Yes |
| Confirm the Storage bucket for `audioUrl` | Backend | 🔴 Yes |
| `ON DELETE CASCADE` migration (recommended) | Backend | 🟡 Soon |
| Transactional RPC wrapper | Backend | 🟡 Soon |
| `deleted_at` migration + purge worker (Option B only) | Backend | 🟡 Soon |
| Reason list, confirmation word + localization | Product | 🟡 Soon |
| Confirmation email | Backend | 🟡 Soon |
| Screens [A]–[E] | Mobile | |

---

## Acceptance checklist

- [ ] Reachable within 3 taps from the main screen (store requirement)
- [ ] In-app, not a web link (store requirement)
- [ ] [A] lists this app's actual data, not a generic warning
- [ ] Deactivate is offered as an alternative
- [ ] 🔒 Re-authentication enforced and verified server-side
- [ ] Wrong password at [B] shows an inline error and deletes nothing
- [ ] Reason step is genuinely skippable
- [ ] Confirmation word is localized
- [ ] Back navigation disabled during [E]
- [ ] 🔒 Deleting a user with sessions + messages + feedback + flashcards + topics succeeds (FK order)
- [ ] Audio objects removed from Storage
- [ ] Retry after a dropped connection succeeds (idempotency)
- [ ] Failure does **not** wipe local state
- [ ] Success performs a complete local wipe — verify caches on disk
- [ ] Other devices are signed out
- [ ] Confirmation email arrives
- [ ] Re-registering with the same email behaves per the confirmed policy
- [ ] Screen reader reads the destructive warning before the confirm control
