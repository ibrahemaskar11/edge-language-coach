# Mobile Implementation Guide — Account & Feed Features

Implementation guide for bringing five features to the mobile client at parity with
the web client.

| # | Feature | Document | Auth state required |
|---|---------|----------|---------------------|
| 0 | **Open questions — read first** | [`00-open-questions.md`](./00-open-questions.md) | — |
| 1 | Forgot Password | [`01-forgot-password.md`](./01-forgot-password.md) | Logged out |
| 2 | Change Password | [`02-change-password.md`](./02-change-password.md) | Logged in |
| 3 | Delete Account | [`03-delete-account.md`](./03-delete-account.md) | Logged in + re-auth |
| 4 | Deactivate Account | [`04-deactivate-account.md`](./04-deactivate-account.md) | Logged in + re-auth |
| 5 | Friends Suggestion in Feed | [`05-friends-suggestion-in-feed.md`](./05-friends-suggestion-in-feed.md) | Logged in |

---

## Scope and provenance

This guide specifies **behavior, states, edge cases, and security requirements** for
each feature, so the mobile client can be built at parity with web.

It was written without direct access to the web client's source. That has one concrete
consequence you must plan around:

> **Every exact route, field name, and policy value is marked `⚠️ CONFIRM`.**
> The behavior around them is specified; the literal strings are not verified.
> [`00-open-questions.md`](./00-open-questions.md) collects all of them into a single
> checklist. Work through it with the web and backend owners before writing code.

Where this guide states a recommendation (for example, explicit reactivation over
silent reactivation), it is flagged as such. Where web already made a choice, **web
wins** — see [Parity rule](#parity-rule).

---

## How to read this guide

Every document follows the same structure:

1. **Purpose** — what the feature does and why
2. **Entry points** — where the user reaches it
3. **Flow** — screen-by-screen, with every state enumerated
4. **API contract** — request/response/error shapes
5. **Client state** — what the app stores, invalidates, and wipes
6. **Edge cases**
7. **Security requirements**
8. **Acceptance checklist** — the QA gate

### Markers used throughout

> **⚠️ CONFIRM** — The exact route, field name, or value must be read off the web
> client or backend before coding. The *behavior* around it is specified; only the
> literal string is unverified. Do not ship a guessed endpoint.

> **📱 MOBILE-ONLY** — No web equivalent exists. This is behavior mobile must add
> because of platform constraints (deep links, store policy, background state).

> **🔒 SECURITY** — Non-negotiable. Do not weaken for convenience.

---

## Shared conventions

These apply to all five features. Implement them once, in shared modules.

### Parity rule

Where this guide and the shipped web client disagree, **the web client wins** —
except for items marked 📱 MOBILE-ONLY, which have no web counterpart, and items
marked 🔒 SECURITY, which are floors rather than descriptions. When you find a
divergence, fix the guide too so the next person is not misled.

### Auth token handling

- Access token in memory + secure storage; **never** `AsyncStorage`/`SharedPreferences`
  in plaintext. Use Keychain (iOS) / EncryptedSharedPreferences or Keystore (Android).
- Refresh token in secure storage only.
- A single shared HTTP client attaches `Authorization: Bearer <accessToken>` and owns
  refresh. Exactly one refresh may be in flight; concurrent 401s queue behind it.
- On refresh failure → full local wipe → route to the logged-out stack. See
  [Local wipe](#local-wipe).

### Error model

Assume the backend returns a consistent envelope. ⚠️ CONFIRM the exact shape:

```jsonc
{
  "error": {
    "code": "INVALID_CREDENTIALS",   // stable, machine-readable — branch on this
    "message": "Current password is incorrect.", // human-readable fallback
    "details": { "field": "currentPassword" }    // optional
  }
}
```

Rules:

- **Branch on `code`, never on `message`.** Messages are copy and will change.
- Map every known `code` to localized copy in the mobile string table.
- Unknown `code` → generic fallback ("Something went wrong. Please try again.")
  plus log the raw code to your error reporter so gaps surface.
- Network failure (no response) is a **distinct** state from a server error, and gets
  a retry affordance. Never show "invalid password" because the socket dropped.

### HTTP status conventions

| Status | Meaning | Client behavior |
|--------|---------|-----------------|
| `400` | Validation failure | Show inline field error |
| `401` | Token invalid/expired | Attempt refresh once, else log out |
| `403` | Re-authentication required | Route to re-auth prompt |
| `404` | Resource gone | Treat as already-handled where idempotent |
| `409` | Conflict / already in that state | Usually a no-op success on the client |
| `429` | Rate limited | Show cooldown; honor `Retry-After` |
| `5xx` | Server error | Generic error + retry |

### Rate limiting

Any endpoint that sends email or verifies a secret is rate limited server-side.
The client must:

- Read `Retry-After` (seconds) from the `429` response.
- Disable the submit control and show a live countdown.
- Persist the cooldown deadline so backgrounding the app does not reset it.

### Loading and destructive-action states

Every submit button has four states: `idle`, `submitting`, `success`, `error`.

- `submitting` disables the button and shows a spinner **in place** — do not swap in a
  full-screen blocker for an inline form.
- Destructive confirmations (delete, deactivate) require a deliberate second action,
  never a single tap.
- 📱 MOBILE-ONLY: guard against double-submit from rapid double-tap. Disable on first
  press, not on response.

### Local wipe

Used by logout, delete, and deactivate. Extract it as one function and call it from
all three — a partial wipe that leaves cached friend data on disk is a privacy bug.

Clear, in this order:

1. In-memory stores (Redux/Zustand/whatever holds session and user state)
2. Query cache (React Query / SWR / Apollo) — `clear()`, not just invalidate
3. Secure storage (access token, refresh token, biometric flags)
4. Key-value prefs (feature flags, dismissed suggestions, drafts, onboarding flags)
5. Disk caches: image cache, offline database, downloaded media
6. Push token — deregister **server-side first**, then clear locally, so a wiped device
   stops receiving notifications for that account
7. Analytics identity — call `reset()` so the next user is not attributed to the old one

Only then navigate to the logged-out stack, and reset the navigation stack so back
cannot return to authenticated screens.

### Password policy

⚠️ CONFIRM against the web validator and mirror it **exactly**. A mobile rule that is
stricter than web produces "this password works on web but not the app" bug reports;
a looser one lets the server reject after a round trip.

Baseline if no web rule is documented:

- Minimum 8 characters (12 recommended)
- No maximum below 64 characters — never silently truncate
- Do not forbid spaces or any Unicode character
- Reject the top-N breached-password list if the backend exposes such a check
- Show a strength meter as guidance, but the **pass/fail** rule is the server's

Client-side validation is UX only. The server re-validates and is authoritative.

### Accessibility

Applies to every screen in this guide:

- All interactive elements have accessibility labels; icon-only buttons **must** have one.
- Minimum touch target 44×44pt (iOS) / 48×48dp (Android).
- Errors are announced to screen readers (`accessibilityLiveRegion` / `AccessibilityAnnouncement`),
  not conveyed by red border alone.
- Color is never the sole carrier of meaning.
- Layout survives largest system font size — test at maximum Dynamic Type.
- Password fields use `secureTextEntry` with a visibility toggle that is itself labeled.

### Analytics

⚠️ CONFIRM event names with whatever the web client already emits so funnels join.
Each feature document lists the events it should fire.

### Offline behavior

None of these five features work offline. When the device is offline:

- Show an offline banner rather than letting a request hang.
- Do **not** queue password changes, deletions, or deactivations for later replay —
  a security action replayed at an unknown future time is a bug, not a feature.
- Friend requests **may** be optimistic (see feature 5), but must roll back on failure.
