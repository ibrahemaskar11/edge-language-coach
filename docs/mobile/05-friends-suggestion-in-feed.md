# 5. Friends Suggestion in Feed

**Auth state:** Logged in
**Depends on:** Feed list virtualization, friendship state machine

---

## Purpose

Surfaces people the user may know, inline in the main feed, so they can send friend
requests without leaving what they were doing.

Two things make this harder than it looks:

1. It is a **second data source injected into a virtualized list**. Naive
   implementations break scroll position, key stability, and recycling.
2. **Friendship state is shared** with every other surface in the app (profile,
   search, friends list, notifications). If the suggestion card owns its own copy of
   that state, the UI goes inconsistent the moment the user acts anywhere else.

Solve both explicitly rather than discovering them in QA.

---

## Placement in the feed

⚠️ CONFIRM the cadence web uses and mirror it — a different cadence on mobile makes
cross-platform engagement metrics incomparable.

Typical pattern:

- First suggestion block after the **3rd** feed item
- Then every **15** items thereafter
- At most **2–3** blocks per feed session

Rules:

- The block is a single feed item from the list's perspective — one entry in the data
  array with a stable synthetic id (e.g. `suggestions:0`), so virtualization and key
  extraction behave.
- Never inject at index 0. A user opening the app should see content first.
- 📱 MOBILE-ONLY: never inject a block **above** the user's current scroll position
  after the list has rendered. Inserting above the viewport jumps the scroll and is
  disorienting. Compute injection points when a page of feed data arrives, then leave
  them fixed.
- If fewer than **⚠️ CONFIRM (typically 3)** suggestions are available, render nothing
  at all. Do not render a card with one person in it, and do not render an empty-state
  card in the middle of a feed.

---

## Anatomy

```
┌──────────────────────────────────────────────┐
│  People you may know               See all → │
│  ┌────────┐ ┌────────┐ ┌────────┐            │
│  │   ✕    │ │   ✕    │ │   ✕    │  →  scroll │
│  │ avatar │ │ avatar │ │ avatar │            │
│  │  Name  │ │  Name  │ │  Name  │            │
│  │ 3 mut. │ │ 1 mut. │ │ 7 mut. │            │
│  │ [Add]  │ │ [Add]  │ │ [Add]  │            │
│  └────────┘ └────────┘ └────────┘            │
└──────────────────────────────────────────────┘
```

**Header:** section title + "See all" → the full suggestions screen.

**Card:**

| Element | Notes |
|---------|-------|
| Avatar | Placeholder on missing/failed load. Never a broken image |
| Display name | Max 2 lines, then ellipsis. Do not truncate to 1 line — many names wrap |
| Reason line | "3 mutual friends" / "From your contacts" / "In Photography Club". Highest-signal element on the card; never omit it |
| Primary action | `Add friend` → `Requested` after tap |
| Dismiss (✕) | Top-right corner. Minimum 44×44pt hit area even though the glyph is small |

**Layout:** horizontal scroller (`FlatList horizontal` / `LazyRow`). ⚠️ CONFIRM whether
web uses a horizontal carousel or a vertical stack, and match — this is the most
visible parity item.

📱 MOBILE-ONLY: nest the horizontal list inside the vertical feed carefully. Set
`nestedScrollEnabled` on Android, and make sure the horizontal gesture does not fight
the vertical one. Test on a low-end Android device specifically; this is where it fails.

---

## Actions

### Add friend

**Optimistic**, with rollback. ⚠️ CONFIRM web behaves the same — earlier work on the
web client measured optimistic friendship updates at ~120ms, so mobile should not
introduce a spinner-and-wait round trip that feels slower.

1. On tap, immediately set the card's state to `Requested` and disable the button.
2. Fire `POST` in the background.
3. On success, keep the state and reconcile with the server response.
4. On failure, roll back to `Add friend` and show a non-blocking toast
   ("Couldn't send request. Tap to retry.").

🔒 Optimism applies to the **UI only**. Never treat the request as sent for any purpose
that has side effects (notifications, counters that persist) until the server confirms.

**Card behavior after adding** — ⚠️ CONFIRM and match web:

- **Option A** — card stays, showing `Requested` with an undo affordance. Clearer, and
  allows correcting a mis-tap.
- **Option B** — card animates out and the next suggestion slides in. Better throughput.

Option A is safer on mobile, where mis-taps are common. Whichever web does, match it.

### Dismiss (✕)

- Removes the card immediately with an animation.
- Persists server-side so the person does not reappear on any device or on web.
  ⚠️ CONFIRM the endpoint.
- Offer **Undo** in a toast for ~5 seconds. Dismissal is easy to mis-tap given the small
  target, and without undo the user has permanently removed someone they wanted.
- If the block drops below the minimum count after dismissals, remove the entire block
  rather than leaving a near-empty carousel.

### Tap the card body

Navigate to that user's profile. The whole card is tappable except the two controls.

Ensure the tap target of ✕ and `Add` are excluded from the card's press handler — a
mis-routed tap that opens a profile when the user meant to dismiss is a common bug.

### See all

Full-screen list of suggestions, same cards in a vertical layout, paginated.
⚠️ CONFIRM this screen exists on web and mirror its content and ordering.

---

## Friendship state — shared, not local

The suggestion card must read from and write to the **same** friendship store used by
profile, search, and the friends list.

Required states:

```
NONE ──add──► REQUEST_SENT ──accepted──► FRIENDS
  ▲               │                          │
  └───cancel──────┘                          │
  ◄──────────────── unfriend ────────────────┘

NONE ──(they added you)──► REQUEST_RECEIVED ──accept──► FRIENDS
```

Consequences that must be handled:

- User adds someone from the suggestion card, then opens their profile → profile shows
  `Requested`, not `Add friend`.
- User adds someone from search, scrolls the feed, and that person appears in a
  suggestion block → the card must render `Requested`.
- The other person accepts while the app is open → the card reflects `Friends`.
- Someone the user is **already** friends with, or has a **pending request** with in
  either direction, must never appear as a suggestion. Filter server-side, and filter
  again client-side against the local friendship store as defense in depth — the
  suggestions payload can be seconds stale.

**Implementation:** a normalized store keyed by user id, holding friendship status. The
suggestion card subscribes to it. Do **not** copy the status into carousel-local state.

---

## Fetching and caching

Suggestions are a **separate request** from the feed. Do not couple them.

- Fetch once per feed session, in parallel with the first feed page.
- Cache with a TTL — ⚠️ CONFIRM (15–60 minutes is typical). Suggestions are expensive
  to compute server-side; do not refetch on every scroll.
- Pull-to-refresh on the feed refreshes suggestions too.
- Over-fetch: request ~20 and render ~10, so dismissals can be backfilled locally
  without a round trip.
- If the suggestions request **fails**, render no block. The feed must load normally.
  🔒 A failure in a secondary growth surface must never block primary content.
- Deduplicate against people already shown in an earlier block in the same session.

---

## Ranking signals

Ranking is computed server-side. Mobile does not rank — it renders `ranked` order as
received. Listed here so the client can render the `reason` correctly, because the
reason string should reflect the dominant signal.

⚠️ CONFIRM which signals the backend uses and which reason strings it can return:

| Signal | Reason copy |
|--------|-------------|
| Mutual friends | "3 mutual friends" |
| Shared group | "In Photography Club" |
| Contact match | "From your contacts" |
| Same school/workplace | "Works at Acme" |
| Recently active / popular | *(no specific reason — fall back to generic)* |

Prefer a server-supplied `reason` object over building the string on the client:

```json
{ "reason": { "type": "MUTUAL_FRIENDS", "count": 3 } }
```

The client localizes and pluralizes it. Never render a server-supplied English sentence
directly — it will not localize, and "1 mutual friends" is the inevitable bug.

📱 MOBILE-ONLY — contacts: if contact-based suggestions exist, uploading the address
book requires an explicit permission prompt with a clear pre-prompt explaining why, and
is subject to App Store 5.1.2 and Play's data-safety disclosure. Do **not** silently
request contacts permission because the suggestions feature exists. ⚠️ CONFIRM whether
web has any equivalent (it likely does not), and treat this as a separate feature with
its own consent flow rather than folding it in here.

---

## Exclusions

Never suggest someone who is:

- The current user
- Already a friend
- Has a pending request in **either** direction
- Blocked by, or has blocked, the current user 🔒
- Previously dismissed by the current user
- [Deactivated](./04-deactivate-account.md) or deleted 🔒
- ⚠️ CONFIRM any additional product rules (age-based restrictions, region gating,
  privacy setting "don't suggest me to others")

All enforced server-side. Mirror the ones the client can evaluate (self, friend,
pending, dismissed, deactivated) as a second line of defense — a stale payload
suggesting a blocked user is a serious bug, not a cosmetic one.

---

## API contract

⚠️ CONFIRM routes and fields.

### Fetch suggestions

```http
GET /friends/suggestions?limit=20&cursor=<cursor>
Authorization: Bearer <accessToken>
```

```jsonc
{
  "suggestions": [
    {
      "user": {
        "id": "u_123",
        "displayName": "Sara Ahmed",
        "avatarUrl": "https://...",
        "username": "sara"
      },
      "reason": { "type": "MUTUAL_FRIENDS", "count": 3 },
      "mutualFriends": [ { "id": "u_9", "avatarUrl": "..." } ],  // for a stacked-avatar UI
      "score": 0.87   // debug only — never rendered
    }
  ],
  "nextCursor": "..."
}
```

### Send friend request

```http
POST /friends/requests
{ "userId": "u_123" }
```

| Status | `code` | Client action |
|--------|--------|---------------|
| `200`/`201` | — | Confirm optimistic state |
| `409` | `ALREADY_FRIENDS` / `REQUEST_EXISTS` | **Not an error.** Reconcile to the real state, no toast |
| `403` | `BLOCKED` | Silently remove the card. 🔒 Do not reveal that a block exists |
| `404` | `USER_NOT_FOUND` | Remove the card silently |
| `429` | `RATE_LIMITED` | Roll back, show a cooldown message |

### Cancel a sent request (undo)

```http
DELETE /friends/requests/{userId}
```

### Dismiss a suggestion

```http
POST /friends/suggestions/{userId}/dismiss
```

Fire-and-forget from the UI's perspective; the card is removed optimistically. If it
fails, the person may reappear on the next fetch — acceptable, but log it.

---

## Performance

📱 The suggestions block sits inside the app's most performance-sensitive screen.

- Cards must be **recycled**, not all mounted. Use `FlatList`/`LazyRow`, never a
  `ScrollView` containing a `.map()`.
- `getItemLayout` / fixed item sizes where possible — card size is uniform, so provide
  it and skip measurement.
- Avatars: fixed dimensions, cached, downsampled to display size. Never load a 1024px
  avatar into a 56px view.
- Memoize the card component; a feed re-render must not re-render every card.
- Prefetch the next few avatars as the carousel scrolls.
- Do not animate card removal with a layout animation that reflows the parent feed list
  — animate within the carousel only, or the whole feed janks.

---

## Impression tracking

⚠️ CONFIRM whether web tracks impressions and how, so metrics are comparable.

An impression fires when a card is ≥50% visible for ≥1s. Use the list's
`onViewableItemsChanged` with `viewabilityConfig: { itemVisiblePercentThreshold: 50,
minimumViewTime: 1000 }`.

Fire **once per card per session** — deduplicate by user id. Repeated impressions from
scrolling back and forth destroy the click-through-rate metric.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Fewer than the minimum suggestions | Render no block at all |
| All cards in a block dismissed | Remove the block; do not show an empty state |
| Suggestions request fails | Feed renders normally with no block |
| Suggestions request slow | Feed renders immediately; block appears when ready, but only **below** the current scroll position |
| Person accepts the request while the card is on screen | Card updates to `Friends` |
| User is offline | No block. Do not queue friend requests for later replay |
| Add tapped twice rapidly | Debounce; exactly one request sent |
| Dismiss and add tapped near-simultaneously | Whichever registers first wins; the other is a no-op |
| Suggested user deactivates mid-session | Card removed on next fetch; if tapped, the profile shows "unavailable" |
| Suggested user blocks the current user mid-session | `403` on add → card removed silently 🔒 |
| Same person appears in two blocks | Must not happen — deduplicate across blocks in a session |
| Rotation / fold state change | Carousel scroll position preserved |
| RTL locale | Carousel scrolls right-to-left; ✕ moves to the top-**left**. Test in Arabic |
| Very long display name | Wraps to 2 lines, then ellipsis; card height stays uniform |

---

## Security and privacy

🔒 All mandatory:

1. **Never reveal blocks.** A blocked relationship must be indistinguishable from the
   user simply not existing. No distinct error copy, no distinct behavior.
2. **Never render `score`** or any internal ranking value.
3. **Mutual-friend details respect privacy settings.** ⚠️ CONFIRM whether mutual-friend
   avatars may be shown when the mutual friend's list is private — this is a real leak
   vector.
4. **No contacts upload without explicit consent** and a clear pre-prompt.
5. **Dismissals are per-user and server-persisted**, never inferable by anyone else.
6. **Deactivated and deleted users are excluded**, enforced server-side.

---

## Analytics

⚠️ CONFIRM names against web.

| Event | Properties |
|-------|-----------|
| `friend_suggestions_shown` | `count`, `position_in_feed` |
| `friend_suggestion_impression` | `suggested_user_id`, `reason_type`, `rank` |
| `friend_suggestion_add_tapped` | `suggested_user_id`, `reason_type`, `rank` |
| `friend_suggestion_add_failed` | `reason: <error code>` |
| `friend_suggestion_dismissed` | `suggested_user_id`, `rank` |
| `friend_suggestion_dismiss_undone` | `suggested_user_id` |
| `friend_suggestion_profile_opened` | `suggested_user_id`, `rank` |
| `friend_suggestions_see_all_tapped` | — |

`rank` on every event is what makes the ranking model evaluable. Do not omit it.

---

## Acceptance checklist

- [ ] Block appears at the confirmed feed positions, matching web
- [ ] Never injected above the current scroll position after render
- [ ] Fewer than the minimum → no block rendered
- [ ] Suggestions request failure does not block the feed
- [ ] Add is optimistic and rolls back on failure
- [ ] `409 ALREADY_FRIENDS` is reconciled silently, not shown as an error
- [ ] Adding here updates the profile screen's state, and vice versa
- [ ] Already-friends and pending-request users never appear
- [ ] Blocked users never appear, and `403` removes the card silently
- [ ] Deactivated users never appear
- [ ] Dismiss persists across app restarts and to web
- [ ] Undo restores the card
- [ ] Card body tap opens the profile; ✕ and Add do not
- [ ] ✕ hit area is at least 44×44pt
- [ ] Reason strings are localized and correctly pluralized ("1 mutual friend")
- [ ] Horizontal scroll does not fight the feed's vertical scroll on low-end Android
- [ ] RTL layout mirrors correctly
- [ ] Long names wrap without changing card height
- [ ] Impressions fire once per card per session
- [ ] Cards are recycled — memory stays flat while scrolling a long feed
- [ ] Feed scroll performance is unchanged with blocks present (measure frame drops)
- [ ] Contacts permission, if used, has an explicit pre-prompt
