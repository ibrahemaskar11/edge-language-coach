# 4. Deactivate Account

**Auth state:** Logged in + re-authentication
**Pairs with:** [Delete Account](./03-delete-account.md)

---

## Purpose

Temporarily hides the user's account and content without destroying anything. The user
restores it by signing back in.

The interesting work here is **not** the deactivation screen — it is the long tail of
"what does the rest of the product do when a user is deactivated". Most of this
document is that tail, because it is where implementations diverge between web and
mobile and produce visible inconsistencies.

---

## Semantics — settle these first

⚠️ CONFIRM every row with backend/product before implementing. Whatever the answers
are, mobile must match web **exactly**, because the two clients render the same data.

| Question | Options | Confirmed |
|----------|---------|-----------|
| Is the profile viewable by others? | Hidden entirely / shown as "Unavailable" | |
| Do posts stay visible? | Hidden / visible / visible but unattributed | |
| Do comments stay visible? | Hidden / visible | |
| Do existing friendships survive? | Preserved / severed | |
| Can others find the user in search? | No / yes | |
| Can others message the user? | No / yes, delivered on return | |
| Do 1:1 conversations stay visible to the other party? | Hidden / visible, read-only | |
| Do group memberships persist? | Yes / removed | |
| Are push notifications suppressed? | Yes (should be) | |
| Are emails suppressed? | Marketing only / all non-transactional | |
| Does the user still appear in friend suggestions? | **No — never** | |
| Is there an auto-delete after N days of deactivation? | No / yes, N = ? | |
| How is the account reactivated? | Sign in / sign in + confirm | |

The last question matters most for mobile: silent auto-reactivation means a user who
opens the app out of habit undoes their own decision without noticing.

---

## Entry points

| Location | Control |
|----------|---------|
| Settings → Account | "Deactivate account" row, above "Delete account" |
| [Delete Account](./03-delete-account.md) [A] screen | "Just need a break? Deactivate instead" |

Style it as cautionary, not destructive — it is reversible. Reserve red for delete.

---

## Flow

```
Settings ──► [A] What happens screen
                   │ Continue
                   ▼
             [B] Re-authenticate
                   │ verified
                   ▼
             [C] Confirm  (+ optional duration / reason)
                   │
                   ▼
             [D] Processing ──► local wipe ──► logged-out stack
```

Three screens, not four — the reduced friction relative to delete is intentional and
correct, because the action is reversible.

### [A] "What happens" screen

Answer the user's real questions, drawn from the semantics table above:

> **Deactivate your account**
>
> While your account is deactivated:
> - Your profile won't be visible to anyone
> - Your posts and comments will be hidden *(⚠️ CONFIRM)*
> - You won't appear in search or friend suggestions
> - You won't receive notifications or emails
> - Your friends, messages, and content are kept safe
>
> **You can restore everything by signing in again.** *(⚠️ CONFIRM whether an
> auto-delete deadline exists and state it if so.)*

Contrast with deletion explicitly — one line: "Want to remove your data permanently
instead? Delete your account."

### [B] Re-authenticate

Same mechanism as [Delete Account](./03-delete-account.md#b-re-authenticate).

🔒 SECURITY: still required. Deactivation is an availability attack if an attacker with
a borrowed phone can trigger it — the victim disappears from the product and their
friends cannot reach them.

⚠️ CONFIRM whether web requires re-auth for deactivation. If web does **not**, raise it
rather than silently matching the weaker behavior; note the divergence here either way.

### [C] Confirm

- Single confirmation, standard (not typed, not hold-to-confirm) — reversible actions
  do not warrant that friction.
- ⚠️ CONFIRM whether the product offers a **duration** ("1 week / 1 month / until I come
  back"). If it does, this is where it goes, and the backend needs a scheduled
  reactivation job. If not, omit entirely — do not invent it.
- Optional reason picker, skippable, same rules as delete.

### [D] Processing and sign-out

On success:

- Full [local wipe](./README.md#local-wipe) — identical to logout. Cached feeds and
  friend lists must not survive.
- Deregister the push token server-side.
- Reset navigation to the logged-out stack.
- Show a confirmation: "Your account is deactivated. Sign in any time to restore it."

On failure: error + retry, no wipe.

---

## Reactivation

This is a **login-flow change**, and it is easy to miss when scoping. Whoever owns the
login screen must implement it.

```
Login ──► credentials correct
             │
             ▼
      account is deactivated?
             │yes
             ▼
   [R] Reactivate prompt ──confirm──► reactivate ──► main app
             │
             └──cancel──► signed out, still deactivated
```

### [R] Reactivate prompt

⚠️ CONFIRM the backend behavior on sign-in with a deactivated account:

- **Model A — explicit (recommended).** Login returns a distinguishable response, e.g.
  `403 { "code": "ACCOUNT_DEACTIVATED" }` plus a short-lived token permitting only the
  reactivate call. The client shows [R], and reactivation happens only on confirmation.
- **Model B — implicit.** Login succeeds and silently reactivates. Simpler backend, but
  a user who opens the app by habit loses their break without being asked. If the
  backend does this, push for Model A.

[R] copy:

> **Welcome back**
> Your account is deactivated. Reactivating restores your profile, posts, and
> connections, and makes you visible to others again.
> `[Reactivate my account]`  `[Not now]`

"Not now" signs the user out and leaves the account deactivated.

🔒 Reactivation requires successful authentication first. It is never reachable from an
unauthenticated state.

### After reactivation

- Store the full session; route to the main app.
- Invalidate every cached query — the server-side visibility of this user just changed
  globally, so any stale cache is wrong.
- ⚠️ CONFIRM whether the backend replays notifications accumulated during
  deactivation. If it does, the notification screen may load a large backlog — paginate
  it and do not assume a small list.

---

## API contract

⚠️ CONFIRM routes and fields.

### Deactivate

```http
POST /account/deactivate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reauthToken": "<from step-up>",  // or "password"
  "reason": "TAKING_A_BREAK",       // optional
  "durationDays": 30                 // optional, only if the product offers it
}
```

`200` → `{ "ok": true, "deactivatedAt": "...", "autoReactivateAt": "..." }`

| Status | `code` | Client action |
|--------|--------|---------------|
| `401`/`403` | `INVALID_CREDENTIALS` | Back to [B], inline error |
| `409` | `ALREADY_DEACTIVATED` | Treat as success — wipe and sign out |
| `429` | `RATE_LIMITED` | Countdown |

### Login response when deactivated (Model A)

```http
POST /auth/login
```
```json
{
  "error": {
    "code": "ACCOUNT_DEACTIVATED",
    "message": "..."
  },
  "reactivationToken": "<short-lived>",
  "deactivatedAt": "2026-08-01T00:00:00Z"
}
```

### Reactivate

```http
POST /account/reactivate
{ "reactivationToken": "<token>" }
```

`200` → full session (`accessToken`, `refreshToken`, user object)

---

## Client state

- Deactivation performs the same complete [local wipe](./README.md#local-wipe) as
  logout. No exceptions — a cached feed containing the user's own hidden posts is a leak.
- Hold the `reactivationToken` in memory only, for the duration of screen [R].
- After reactivation, `clear()` the query cache before the first authenticated fetch.

---

## Rendering other users who are deactivated

📱 The most commonly missed part of this feature, and the most visible when wrong. It
affects screens far from Settings, so scope it explicitly.

⚠️ CONFIRM how the API represents a deactivated user — most likely either omitted
entirely from responses, or returned as a stub such as:

```json
{ "id": "...", "displayName": null, "avatarUrl": null, "status": "DEACTIVATED" }
```

The client must handle the stub **everywhere a user is rendered**:

| Surface | Expected behavior |
|---------|-------------------|
| Feed post author | ⚠️ CONFIRM — post hidden entirely, or shown as "Unavailable user" |
| Comment author | Placeholder avatar + "Unavailable user"; not tappable |
| Friends list | ⚠️ CONFIRM — hidden, or shown greyed out |
| Friend suggestions | **Never shown.** Excluded server-side; also filter client-side as defense in depth |
| Search results | Excluded |
| 1:1 conversation | ⚠️ CONFIRM — hidden, or read-only with a "This user is unavailable" banner and the composer disabled |
| Group chat member list | Placeholder entry; ⚠️ CONFIRM whether they are removed |
| Historical messages | Retained; author shown as placeholder |
| Profile deep link to a deactivated user | "This account is unavailable" screen — **never** a crash or an infinite spinner |
| Mentions in existing text | Render as plain text, not a broken link |

🔒 Never render a deactivated user's real display name or avatar from a **local cache**
after the server has stopped returning them. Cache invalidation on this path is a
privacy requirement, not a performance concern.

**Implementation note:** centralize this. One `renderUser()` / `<UserChip>` component
that knows how to display the deactivated state, used everywhere, rather than a
null-check scattered across forty screens. The scattered version will be incomplete.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Deactivate while another device is signed in | That device's next request 401s → forced logout |
| Deactivated user's friend opens their profile | "This account is unavailable" |
| Deactivated user is mid-conversation | Per the semantics table; the other party sees the confirmed state |
| Password reset while deactivated | ⚠️ CONFIRM — should succeed; account stays deactivated |
| Deactivate then immediately delete | Requires signing in again; ⚠️ CONFIRM the reactivate-then-delete path works |
| Auto-delete deadline passes | Account becomes deleted; sign-in behaves as "no such account" |
| Deactivate with a pending friend request | ⚠️ CONFIRM — likely hidden from the recipient and restored on return |
| App killed during [D] | Next launch: token invalid → forced logout → correct state |
| `ALREADY_DEACTIVATED` on retry | Treated as success |
| Duration-based reactivation fires while signed out | Nothing for the client to do; state is correct on next sign-in |

---

## Security requirements

🔒 All mandatory:

1. **Re-authentication required** before deactivating.
2. **All sessions revoked**; **push tokens deregistered**.
3. **Complete local wipe**, identical to logout.
4. **Confirmation email** ("your account was deactivated" + how to restore).
   ⚠️ CONFIRM.
5. **Reactivation requires authentication** — never reachable unauthenticated.
6. **`reactivationToken` is short-lived and scoped** to the reactivate endpoint only.
   It must not be usable as a general access token.
7. **No stale rendering** of deactivated users from local caches.
8. **Excluded from all discovery surfaces** — search, suggestions, invite lists —
   enforced server-side, mirrored client-side.

---

## Analytics

| Event | Properties |
|-------|-----------|
| `deactivate_opened` | `source: settings \| delete_flow` |
| `deactivate_reason_selected` | `reason` |
| `deactivate_confirmed` | `duration_days` (nullable) |
| `deactivate_abandoned` | `step` |
| `reactivate_prompt_shown` | `days_deactivated` |
| `reactivate_confirmed` | `days_deactivated` |
| `reactivate_declined` | `days_deactivated` |

`reactivate_prompt_shown` vs `reactivate_confirmed` is the metric that tells product
whether the break feature is working as intended.

---

## Acceptance checklist

- [ ] Re-authentication enforced
- [ ] Confirmation screen accurately describes the **confirmed** semantics, not guesses
- [ ] Delete is offered as the alternative, and vice versa
- [ ] Success performs a complete local wipe
- [ ] Push notifications stop
- [ ] Other devices are signed out
- [ ] Signing in shows the reactivate prompt (Model A)
- [ ] "Not now" leaves the account deactivated
- [ ] Reactivation restores full access and clears the query cache
- [ ] Deactivated user never appears in friend suggestions
- [ ] Deactivated user never appears in search
- [ ] Profile deep link to a deactivated user shows the unavailable screen, no crash
- [ ] Feed, comments, chat, and member lists all render the deactivated placeholder
- [ ] No cached name or avatar of a deactivated user is rendered after the fact
- [ ] Mobile rendering of deactivated users matches web exactly, surface by surface
- [ ] Confirmation email arrives
- [ ] Auto-delete deadline, if any, is stated accurately
