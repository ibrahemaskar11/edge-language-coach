# 5. Friends Suggestion in Feed

**Status:** 🆕 Not built — and unlike features 1–4, this one has **no foundation at all**.
There is no social graph, no friendship concept, and no feed in the conventional sense.
**Auth state:** Logged in

---

## Read this first

Features 1–4 add screens to an existing account system. This feature adds an entire
**product surface** that does not exist:

✅ VERIFIED — the complete data model is
`Profile`, `Topic`, `UserTopic`, `Flashcard`, `UserFlashcard`, `PlacementQuestion`,
`Session`, `Feedback`, `Message` (`packages/db/prisma/schema.prisma`). There is no
relationship between two `Profile` rows anywhere in the schema. Users cannot see, find,
or interact with each other in any way.

So this is not a mobile task with a web reference to copy. It is:

1. A **product decision** — should a solo language-practice app have a social graph, and
   what is it for?
2. A **backend build** — two new tables, RLS, a suggestions endpoint, friend-request
   endpoints.
3. Only then, **client work** on web and mobile.

⚠️ **CONFIRM the product intent before any of this is built.** Sections below specify the
build assuming it is approved, in this codebase's idiom, so estimation is possible.

---

## What "feed" means here

There is no feed. The nearest surface is the **Playground dashboard**
(`apps/web/src/routes/_authenticated.playground.index.tsx`), a stacked set of sections:

```
Playground
├── Header — "Welcome back, {firstName}"
├── Quick Access
├── Recommended topics      ← from /api/recommendations, sliced to 4
├── Recent sessions         ← from stats.recentSessions, sliced to 3
└── Flashcards due
```

⚠️ CONFIRM that "feed" means this dashboard. Assuming it does, friend suggestions become
**one more section** — which is good news: the recommended-topics section is a working,
shipped precedent for "server-ranked list rendered as a horizontal row of cards", and
this feature should look and behave like its sibling.

Placement: ⚠️ CONFIRM with design. Suggest **below** recent sessions — the dashboard's
job is getting the user practicing, and a social module above that competes with it.

Everything in generic guidance about "inject a card every 15 feed items" does **not
apply here** — there is no infinite feed to inject into. It is a fixed section on a
finite dashboard.

---

## Schema 🆕

Following the repo's conventions: a timestamped file in `supabase/migrations/`, enum
types declared like `20260507000000_add_enum_types.sql`, and a hand-synced update to
`packages/db/prisma/schema.prisma`.

```sql
-- supabase/migrations/<YYYYMMDDHHMMSS>_add_friendships.sql

CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       "FriendshipStatus" NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
);

-- One relationship per pair, in either direction.
CREATE UNIQUE INDEX friendships_pair_uq ON friendships (
  LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
);
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX friendships_requester_idx ON friendships (requester_id, status);

CREATE TABLE suggestion_dismissals (
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dismissed_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dismissed_id)
);

-- 🔒 Required: RLS is on for every table in this project, with no policies,
-- because all access goes through the gateway's service-role client.
-- See packages/db/prisma/migrations/enable_rls.sql for the rationale.
ALTER TABLE friendships            ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_dismissals  ENABLE ROW LEVEL SECURITY;
```

Notes:

- The `LEAST`/`GREATEST` unique index is what stops A→B and B→A both existing. Without
  it, two users adding each other simultaneously creates a duplicate relationship — the
  single most common bug in friendship schemas.
- 🔒 `ON DELETE CASCADE` here, unlike the existing tables, so
  [feature 3](./03-delete-account.md#deletion-order) does not need two more ordered
  steps. Add them to that route's order if you choose not to cascade.
- `profiles` currently exposes only `full_name` and `email`. ⚠️ CONFIRM what a user may
  see about another user. 🔒 **`email` must never be returned** in a suggestion payload.
  An avatar column does not exist and would need adding if the design has avatars.

---

## Suggestions endpoint 🆕

Model it directly on `apps/gateway/src/routes/recommendations.ts` — same shape, same
`limit`, same fallback discipline, same re-order-after-bulk-fetch trick.

That route's structure (`routes/recommendations.ts`):

1. `const limit = 10` (line 32)
2. Fetch candidates
3. Fetch the user's context in parallel
4. Score each candidate with a small integer weight table (lines 97-109)
5. `scored.sort((a, b) => b.score - a.score)` (line 110)
6. Take `topIds`, fetch full rows with `.in("id", topIds)`, then **re-order to preserve
   ranking** (lines 121-125) — because Postgres does not preserve `IN` order
7. Wrap everything in `try/catch` with a simpler fallback query (line 126)

Apply the same to people:

```ts
// apps/gateway/src/routes/friends.ts  🆕
fastify.get("/api/friends/suggestions", async (request, reply) => {
  const limit = 10;
  // candidates: profiles excluding self, existing friendships (either direction),
  //             pending requests, blocks, and dismissals
  // signals (⚠️ CONFIRM weights with product):
  //   +15  same italian_level                 — the strongest practice-partner signal
  //   +8   adjacent CEFR level                — reuse cefrDistance() from recommendations.ts:13
  //   +10  overlapping user_topics
  //   +5   mutual friend
  //   +3   active in the last 7 days (has a recent session)
  //   -20  previously dismissed (or exclude outright)
  return reply.send(toCamelCase(ordered));
});
```

`cefrDistance()` (`routes/recommendations.ts:13-20`) is directly reusable. ⚠️ CONFIRM
whether to extract it to a shared util rather than duplicating it.

🔒 The response must expose only what the design needs — id, display name, level, the
reason, mutual count. Never `email`, never internal `score`.

**Response** (camelCase, via `toCamelCase`, per repo convention):

```jsonc
{
  "suggestions": [
    {
      "user": { "id": "uuid", "fullName": "Sara Ahmed", "italianLevel": "B1" },
      "reason": { "type": "SAME_LEVEL" },       // structured, not a sentence
      "mutualCount": 3
    }
  ]
}
```

🔒 `reason` must be **structured**, not a prebuilt English string. The client localizes
and pluralizes it — this app's users are language learners, so "1 mutual friends" is a
particularly bad look.

### Friend request routes 🆕

```
POST   /api/friends/requests            { addresseeId }   → 201
DELETE /api/friends/requests/:userId                      → 200  (cancel)
POST   /api/friends/requests/:id/accept                   → 200
POST   /api/friends/requests/:id/decline                  → 200
GET    /api/friends                                       → accepted friends
GET    /api/friends/requests                              → incoming/outgoing
POST   /api/friends/suggestions/:userId/dismiss           → 200
```

All follow the existing route conventions: Zod schemas from `@edge/shared`, the
`ZodError` → `400 { message: "Validation error", errors }` pattern from
`routes/sessions.ts:9-19`, `toCamelCase` on the way out, `{ message }` errors.

> **Accepting a friend request is a notification-worthy event, and there is no
> notification system in this codebase.** ⚠️ CONFIRM whether one is in scope. If not,
> requests are only discoverable by opening the app and looking — which materially
> limits how well this feature can work. Say so to product before building it.

---

## Client — mobile

### Data layer

Mirror the web query-key conventions (`apps/web/src/hooks/use-api.ts`):

| Key | Notes |
|-----|-------|
| `["friend-suggestions"]` | `staleTime: 5 * 60 * 1000`, matching `["recommendations"]` |
| `["friends"]` | |
| `["friend-requests"]` | |

On a successful add, invalidate `["friend-suggestions"]` and `["friend-requests"]` —
the existing code invalidates broadly rather than surgically (`useSendMessage`
invalidates four keys), so follow that habit.

### 🔒 Friendship state must be shared, not local to the card

The moment a profile screen or a friends list exists, the suggestion card cannot own its
own copy of "are we friends". Keep friendship status in **one** normalized store keyed by
user id, and have every surface read from it.

```
NONE ──add──► REQUEST_SENT ──accepted──► FRIENDS
  ▲               │                          │
  └───cancel──────┘                          │
  ◄──────────────── unfriend ────────────────┘

NONE ──(they added you)──► REQUEST_RECEIVED ──accept──► FRIENDS
```

### Section UI

Match the dashboard's existing sections — a titled `section` with a horizontal row of
cards, the same treatment recommended topics gets.

| Element | Notes |
|---------|-------|
| Section title | "Practice partners" or similar. ⚠️ CONFIRM copy — "People you may know" implies a social network this product isn't |
| Card: name | Max 2 lines then ellipsis |
| Card: level badge | Reuse the existing `Badge` component's web styling for CEFR levels |
| Card: reason line | "Also learning B1" / "3 mutual friends". Highest-signal element; never omit |
| Card: primary action | `Add` → `Requested` |
| Card: dismiss ✕ | 📱 Minimum 44×44pt hit area even though the glyph is small |

**Empty state:** if fewer than ⚠️ CONFIRM (suggest 3) suggestions exist, render **no
section at all**. The dashboard already degrades this way — it falls back to
`topics?.slice(0, 4)` when recommendations are empty
(`_authenticated.playground.index.tsx:35`).

**Loading:** the web dashboard blocks on a single combined `isLoading` and shows one
spinner (lines 25-33). 📱 **Do not copy that.** Suggestions must load independently — a
slow social query must never delay the dashboard. Render the section's own skeleton, and
🔒 if the request fails, render nothing and let the rest of the dashboard work.

### Add — optimistic

1. On tap, set the card to `Requested` and disable the button immediately.
2. Fire `POST /api/friends/requests`.
3. On success, reconcile with the response.
4. On failure, roll back and show a retry snackbar.

🔒 Optimism is **UI only** — never treat the request as sent for anything with side
effects until the server confirms.

⚠️ CONFIRM whether the card stays showing `Requested` (clearer, allows undo) or animates
out (better throughput). Recommend staying — mis-taps are common on mobile.

### Dismiss

- Remove immediately, persist via the dismiss endpoint.
- Offer **Undo** in a snackbar for ~5s. The ✕ target is small and mis-taps are common;
  without undo the user permanently loses someone they wanted.
- If the section drops below the minimum after dismissals, remove the whole section.

### Exclusions 🔒

Never suggest someone who is: the current user · already a friend · has a pending
request in either direction · blocked in either direction · previously dismissed ·
[deactivated or deleted](./04-deactivate-account.md).

Enforced server-side in the query; mirrored client-side against the friendship store as
defense in depth, because the payload can be seconds stale.

> **⚠️ This is where [feature 4](./04-deactivate-account.md) stops being simple.** That
> document notes the app has no social surface, so deactivation is only about API access.
> The moment friendships exist, a deactivated user must be excluded from suggestions and
> rendered as a placeholder anywhere a person appears. Revisit feature 4 if this ships.

---

## Performance 📱

- Cards must be recycled — `FlatList`/`LazyRow`, never a `ScrollView` with `.map()`.
- Fixed card dimensions so item layout can be precomputed.
- Memoize the card; a dashboard re-render must not re-render every card.
- 📱 Nest the horizontal list inside the vertical dashboard carefully:
  `nestedScrollEnabled` on Android, and verify the horizontal gesture doesn't fight the
  vertical one. Test on a low-end Android device specifically — this is where it fails.
- Animate card removal **within** the section only; a layout animation that reflows the
  whole dashboard will jank.
- ⚠️ The gateway's 60/min rate limit is shared app-wide (`server.ts:68`). A dashboard
  that already fires topics + stats + sessions + decks + recommendations is at 5
  requests per load; adding suggestions makes 6. Pull-to-refresh multiplies it. Watch it.

---

## Privacy 🔒

This is the section to take to whoever owns privacy before building.

1. **Never return `email`** in any suggestion or friend payload. `profiles.email` is
   `@unique` and is the login identifier.
2. **`fullName` becomes visible to strangers.** Today it is collected at sign-up
   (`apps/web/src/lib/auth.ts:45,56`) and shown only to its owner. Making it discoverable is
   a change in what users consented to. ⚠️ CONFIRM whether existing users must opt in,
   and whether a separate display name / username is needed.
3. **`italianLevel` becomes visible.** Proficiency is mildly sensitive. ⚠️ CONFIRM.
4. **Add a "don't suggest me to others" setting.** It belongs in the same settings
   surface features 2–4 need, and 🔒 it should exist from day one, not be retrofitted.
5. **Mutual-friend counts leak graph structure.** Showing a count is generally fine;
   showing *who* requires the mutual friend's consent. ⚠️ CONFIRM before rendering names
   or avatars.
6. **Blocks must be invisible.** A blocked relationship must be indistinguishable from
   the user not existing — no distinct copy, no distinct error, no timing difference.
7. **Never render `score`** or any internal ranking value.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Fewer than the minimum suggestions | No section rendered |
| Suggestions request fails | Dashboard renders normally, no section 🔒 |
| Suggestions slow | Dashboard renders immediately; section fills in when ready |
| All cards dismissed | Section removed, no empty state |
| Add tapped twice rapidly | Debounced; exactly one request |
| Both users add each other simultaneously | 🔒 The `LEAST`/`GREATEST` unique index rejects the second; the route must catch it and resolve to `FRIENDS` rather than surfacing a `500` |
| Add returns 409 (already friends / request exists) | Reconcile silently — not an error toast |
| Blocked user | `403` → remove the card silently 🔒 |
| Suggested user deactivates mid-session | Excluded on next fetch; tapping shows "unavailable" |
| Suggested user deletes their account | `ON DELETE CASCADE` removes the friendship rows; the card 404s → remove silently |
| Same person in two sections | Deduplicate within a session |
| RTL locale | Carousel scrolls right-to-left; ✕ moves to the top-**left**. This app's learner base makes RTL likely — test in Arabic |
| Very long `fullName` | Wraps to 2 lines then ellipsis; card height stays uniform |
| Rate limit hit | `429` → back off; do not retry in a loop |

---

## Work breakdown

| Task | Owner | Blocking? |
|------|-------|-----------|
| **Product decision: does this app have a social graph?** | Product | 🔴 Yes — everything |
| Privacy review of exposing `fullName` / `italianLevel` | Product + Legal | 🔴 Yes |
| Confirm "feed" = Playground dashboard | Product + Design | 🔴 Yes |
| `friendships` + `suggestion_dismissals` migration + RLS + Prisma sync | Backend | 🔴 Yes |
| Friend request routes | Gateway | 🔴 Yes |
| `GET /api/friends/suggestions` + scoring weights | Gateway | 🔴 Yes |
| Zod schemas in `@edge/shared` | Shared | 🔴 Yes |
| "Don't suggest me" privacy setting | Backend + Clients | 🟡 Soon |
| Notification system for accepted requests | Backend | 🟡 Decide |
| Avatar column, if the design has avatars | Backend | 🟡 If needed |
| Revisit [feature 4](./04-deactivate-account.md) exclusions | Backend | 🟡 After |
| Shared friendship store | Mobile | |
| Dashboard section + cards | Mobile (+ Web for parity) | |

---

## Acceptance checklist

- [ ] 🔒 No suggestion payload contains an email address
- [ ] 🔒 Suggestions request failure does not block the dashboard
- [ ] 🔒 Suggestions load independently — a slow query does not delay other sections
- [ ] Fewer than the minimum → no section rendered
- [ ] Add is optimistic and rolls back on failure
- [ ] `409` is reconciled silently, not shown as an error
- [ ] Simultaneous mutual add resolves to friends, not a `500`
- [ ] Adding here updates every other surface showing that user
- [ ] Already-friends and pending-request users never appear
- [ ] Blocked users never appear; `403` removes the card silently
- [ ] Deactivated and deleted users never appear
- [ ] Deleting an account removes its friendship rows (cascade verified)
- [ ] Dismiss persists across app restarts and to web
- [ ] Undo restores the card
- [ ] ✕ hit area is at least 44×44pt and excluded from the card's tap handler
- [ ] Reason strings are localized and correctly pluralized
- [ ] RTL layout mirrors correctly
- [ ] Horizontal scroll does not fight the dashboard's vertical scroll on low-end Android
- [ ] Cards are recycled — memory stays flat while scrolling
- [ ] Dashboard request count and rate-limit headroom measured with the section present
- [ ] "Don't suggest me to others" is honored
