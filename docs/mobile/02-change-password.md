# 2. Change Password

**Auth state:** Logged in
**Depends on:** Nothing beyond the authenticated HTTP client

---

## Purpose

Lets a signed-in user replace their password, proving they are the account holder by
supplying the current one. Distinct from [Forgot Password](./01-forgot-password.md),
which is for users who cannot sign in.

The critical design decision is **session handling after success** — see
[After success](#after-success). Getting it wrong either logs the user out of the
device they just used (annoying) or leaves an attacker's session alive (a security bug).

---

## Entry points

| Location | Control |
|----------|---------|
| Settings → Account | "Change password" row |
| Security/Privacy section, if one exists | Same row |

**Visibility rule:** hide or transform this row for accounts with no password.

⚠️ CONFIRM how the backend reports whether the account has a password —
likely a field on the profile/me response such as `hasPassword` or a list of linked
identity providers. Behavior:

| Account type | Row behavior |
|--------------|--------------|
| Email + password | "Change password" → full flow below |
| OAuth-only (Google / Apple) | "Set password" → same screen **without** the current-password field; ⚠️ CONFIRM the backend supports setting an initial password, and whether it requires re-auth via the provider first |
| OAuth + password already linked | "Change password" → full flow |

Do not show "Change password" to an OAuth-only user and let them fail at submit.

---

## Flow

```
Settings ──► [A] Change password form
                     │ submit
                     ▼
             ┌───────┴────────┐
        success              failure
             │                │
             ▼                ▼
        [B] Success      inline error on the offending field
             │
             ▼
      Settings (toast) + other sessions revoked
```

### [A] Change password form

**Fields, in this order:**

1. **Current password** — `textContentType="password"` / `autoComplete="current-password"`
2. **New password** — `textContentType="newPassword"` / `autoComplete="new-password"`
3. **Confirm new password** — same content type

Details:

- Independent visibility toggle per field.
- Live policy checklist under the new-password field. See
  [Password policy](./README.md#password-policy) — mirror web's rules exactly.
- Submit enabled only when all three are non-empty and 2 matches 3.
- A "Forgot your current password?" link routing into
  [Forgot Password](./01-forgot-password.md) — this is a real dead end otherwise, and a
  user who cannot recall their current password has no other path.
- 📱 MOBILE-ONLY: offer biometric re-auth (Face ID / Touch ID / BiometricPrompt) as a
  substitute for typing the current password **only if** web has an equivalent
  step-up mechanism and the backend accepts the resulting attestation. ⚠️ CONFIRM.
  If the backend has no such notion, do not invent one — a local-only biometric check
  that still sends a stored password is security theater.

**States:** `idle` → `submitting` → `success` | `error`

### Errors

| Condition | `code` (⚠️ CONFIRM) | Display |
|-----------|--------------------|---------|
| Current password wrong | `INVALID_CREDENTIALS` | Inline on **current password**: "Current password is incorrect." |
| New password fails policy | `PASSWORD_POLICY` | Inline on **new password**, naming the unmet rule |
| New == current | `PASSWORD_REUSED` | Inline on **new password**: "New password must be different from your current password." |
| Matches a recent password | `PASSWORD_RECENTLY_USED` | Inline: "You've used this password recently. Choose a different one." |
| Confirm mismatch | *client-side* | Inline on **confirm** |
| Too many attempts | `RATE_LIMITED` | Countdown, submit disabled |
| Session expired mid-flow | `401` | Refresh once; if that fails, log out and preserve nothing |
| Network | — | Banner + Retry |

🔒 SECURITY: an incorrect current password is a **failed authentication attempt**. It
must be rate limited server-side and must not be distinguishable in timing from a
correct one that failed policy.

### [B] After success

⚠️ CONFIRM which model web uses — this is the item most likely to diverge:

**Model 1 — keep current session, revoke all others (recommended).**
The backend issues a fresh token pair for the calling device and invalidates every
other refresh token. The user stays signed in here; other devices are signed out.

Client work:

- Store the new token pair returned in the response. **If the backend rotates tokens,
  you must persist them.** Missing this is the classic bug: the change succeeds, then
  the next request 401s because the old token was revoked.
- ⚠️ CONFIRM whether the response body carries new tokens or whether the existing
  token stays valid.
- Show a success toast on Settings: "Password changed. You've been signed out on other
  devices."

**Model 2 — revoke everything including this session.**
User is returned to login and must sign in with the new password.

- Perform a full [local wipe](./README.md#local-wipe).
- Route to login with email prefilled and a toast: "Password changed. Please sign in
  again."

Whichever model web uses, mobile uses the same one. Do not mix.

---

## API contract

⚠️ CONFIRM route and fields.

```http
POST /account/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "<current>",
  "newPassword": "<new>"
}
```

**`200`:**

```jsonc
{
  "ok": true,
  // Present under Model 1 if the backend rotates tokens — persist these.
  "accessToken": "...",
  "refreshToken": "..."
}
```

| Status | `code` | Client action |
|--------|--------|---------------|
| `400` | `PASSWORD_POLICY` | Inline on new password |
| `400` | `PASSWORD_REUSED` | Inline on new password |
| `401` | `INVALID_CREDENTIALS` | Inline on current password — **do not** treat as an expired session |
| `401` | *token expired* | Refresh, retry once, else log out |
| `429` | `RATE_LIMITED` | Countdown |

⚠️ **Ambiguity to resolve with backend:** `401` is used both for "wrong current
password" and "your access token expired". The client cannot distinguish them without
the `code`. If the backend does not return a distinguishing code, ask for one — or ask
for wrong-password to return `403`. Guessing here produces spurious logouts.

### Setting an initial password (OAuth-only accounts)

⚠️ CONFIRM whether this endpoint exists and its shape:

```http
POST /account/set-password
{ "newPassword": "<new>" }
```

---

## Client state

- Passwords live in component state only. Never in a global store, never persisted,
  never in a form-autosave/draft mechanism.
- Clear all three fields on unmount, on success, and on backgrounding.
  📱 MOBILE-ONLY: also clear on app background — a password left in a field is visible
  in the OS app switcher snapshot.
- 📱 MOBILE-ONLY: enable the OS secure-screen flag while this screen is mounted
  (`FLAG_SECURE` on Android; on iOS blur or overlay the window on `willResignActive`)
  so the app-switcher screenshot does not capture typed credentials.
- On success under Model 1: persist rotated tokens **before** navigating away.
- On success under either model: invalidate any cached "security" or "sessions" screen
  data so device lists reflect the revocations.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| User has no password (OAuth-only) | Row reads "Set password"; current-password field hidden |
| New password identical to current | Server rejects with `PASSWORD_REUSED`; also check client-side to save a round trip |
| Password manager autofills current into all three fields | Detect and clear; validate that new ≠ current before enabling submit |
| App backgrounded mid-form | Fields cleared on resume, with a brief explanatory note rather than silent loss |
| Token expires between form load and submit | Silent refresh, retry once, transparent to the user |
| Change succeeds but token persistence fails | Next request 401s → refresh fails → forced logout. Acceptable, but persist tokens *before* navigating to make it rare |
| Two devices change the password concurrently | Second request fails with `INVALID_CREDENTIALS` (its "current" is stale). Show the normal inline error |
| User is deactivated | ⚠️ CONFIRM — likely blocked; a deactivated user should reactivate first |
| Very long password (64+ chars) from a generator | Must be accepted, never truncated |
| Unicode / emoji in password | Must be accepted. Normalize consistently (NFC) on both platforms and match web ⚠️ CONFIRM |

---

## Security requirements

🔒 All mandatory:

1. **Current password always required** for a change (not for an initial set on an
   OAuth-only account, where the provider session is the proof).
2. **All other sessions revoked** on success.
3. **Confirmation email** sent by the backend ("your password was changed"). ⚠️ CONFIRM.
4. **Rate limited** on the current-password check, server-side.
5. **Never log** any of the three field values — including in redux devtools, network
   inspectors shipped in release builds, or crash-report breadcrumbs.
6. **Secure-screen flag** set while the form is mounted (📱 MOBILE-ONLY).
7. **No client-side password storage** — the app must never be able to answer "what is
   my current password", which means no "remember password" feature.
8. **TLS pinning** if the rest of the app uses it; do not exempt this route.

---

## Analytics

| Event | Properties |
|-------|-----------|
| `change_password_opened` | `source: settings` |
| `change_password_submitted` | — |
| `change_password_failed` | `reason: <error code>` |
| `change_password_succeeded` | — |

🔒 Never attach password values or lengths.

---

## Acceptance checklist

- [ ] Wrong current password shows an inline error and does **not** log the user out
- [ ] New == current is rejected with a clear message
- [ ] Policy matches web exactly at the boundary (test min length ±1 on both clients)
- [ ] 64+ character password is accepted unmodified
- [ ] OS password manager offers to update the saved entry
- [ ] Rotated tokens persist — the next authenticated request succeeds
- [ ] Other devices are signed out (verify on a second device)
- [ ] Confirmation email arrives
- [ ] Fields clear when the app is backgrounded
- [ ] App-switcher snapshot does not show typed characters
- [ ] OAuth-only account sees "Set password", not "Change password"
- [ ] "Forgot your current password?" routes into the reset flow
- [ ] Rate limiting produces a countdown, not a generic error
- [ ] Screen reader announces which field failed
- [ ] Airplane mode shows a network error, not "incorrect password"
