# 1. Forgot Password

**Auth state:** Logged out
**Depends on:** Deep linking, email delivery

---

## Purpose

Lets a user who cannot sign in regain access by proving control of their email
address. The user never learns their old password; they set a new one.

This is the single most abuse-prone unauthenticated endpoint in the app. Most of the
requirements below exist to stop account enumeration and reset-token theft, not to
improve UX.

---

## Entry points

| Location | Control |
|----------|---------|
| Login screen | "Forgot password?" — below the password field |
| Login screen, after a failed attempt | Same link, visually promoted after 2 failures |

📱 MOBILE-ONLY: if the user arrives via a reset deep link while already logged in as a
**different** account, log the current account out first, then continue. Never apply a
reset token to the session that happens to be active.

---

## Flow

```
Login ──"Forgot password?"──► [A] Request screen
                                    │ submit email
                                    ▼
                              [B] Confirmation screen  ("check your email")
                                    │
                        user taps link in email
                                    ▼
                              [C] Deep link handoff
                                    │ token validated
                          ┌─────────┴──────────┐
                     valid│                    │invalid / expired
                          ▼                    ▼
                  [D] New password       [E] Invalid-token screen
                          │ submit             │ "Request a new link"
                          ▼                    └──► back to [A]
                  [F] Success ──► Login (or auto sign-in)
```

### [A] Request screen

**Fields:** email (single).

- `keyboardType="email-address"`, `autoCapitalize="none"`, `autoCorrect={false}`,
  `textContentType="username"` / `autoComplete="email"`.
- Prefill from the login screen if the user already typed an email there. This is the
  single highest-value UX detail on this screen.
- Validate format client-side only to catch typos. Do **not** check existence.

**States:** `idle` → `submitting` → navigate to [B] | `error`

**Errors:**

| Condition | Display |
|-----------|---------|
| Empty / malformed email | Inline: "Enter a valid email address." |
| `429` | Inline + countdown: "Too many attempts. Try again in 4:32." |
| Network failure | Banner with Retry |
| `5xx` | Banner: generic + Retry |

### [B] Confirmation screen

🔒 SECURITY: **The response is identical whether or not the account exists.** The
backend returns `200` in both cases; the client shows the same screen. There must be
no difference in copy, timing, or navigation that reveals registration status.

Copy pattern:

> **Check your email**
> If an account exists for `user@example.com`, we've sent a link to reset your password.
> The link expires in 60 minutes. ⚠️ CONFIRM the real expiry and state it accurately.

Controls:

- **Open mail app** — 📱 MOBILE-ONLY. Deep link to the default mail client
  (`message://` on iOS, `Intent.ACTION_MAIN` with `CATEGORY_APP_EMAIL` on Android).
  Wrap in a capability check and hide the button if no handler exists.
- **Resend** — disabled behind a cooldown (⚠️ CONFIRM; 60s is typical) with a visible
  countdown. Persist the deadline; backgrounding must not reset it.
- **Back to sign in**

### [C] Deep link handoff — 📱 MOBILE-ONLY

This is the part with no web equivalent and where most implementations break.

The reset email contains an HTTPS link. It must be registered as an
**App Link (Android) / Universal Link (iOS)** so it opens the app when installed and
falls back to the web reset page when not.

⚠️ CONFIRM with backend/web:

- The link URL pattern (e.g. `https://<domain>/reset-password?token=...`)
- The query parameter name carrying the token
- Whether the token is single-use and its TTL
- Whether `apple-app-site-association` and `assetlinks.json` are already served for
  this path — if the web team owns that domain config, this needs coordinating **before**
  mobile work starts. Treat it as a dependency, not an afterthought.

Requirements:

- Handle the link in **both** cold start and warm resume. Cold start is the common
  failure: the deep link arrives before your navigation container mounts. Buffer the
  pending link and replay it once navigation is ready.
- Validate the token with the server **before** showing the new-password form, so an
  expired link fails immediately instead of after the user has typed a password twice.
  ⚠️ CONFIRM whether a validate-only endpoint exists; if not, accept the late failure
  and preserve the typed input so the user does not retype.
- 🔒 SECURITY: strip the token from any in-app URL you log, and from analytics
  properties. Reset tokens in logs are credentials in logs.

### [D] New password screen

**Fields:** new password, confirm new password.

- `textContentType="newPassword"` / `autoComplete="new-password"` so the OS password
  manager offers to generate and save.
- Visibility toggle on both fields.
- Live policy checklist (see [Password policy](./README.md#password-policy)).
- Submit disabled until both fields are non-empty and match.

**Errors:**

| Condition | Display |
|-----------|---------|
| Mismatch | Inline on confirm field: "Passwords do not match." |
| Fails policy | Inline, with the specific unmet rule |
| Token expired/used (`400`) | Route to [E] — do not show as a field error |
| `429` | Countdown |

### [E] Invalid-token screen

Reached when the token is expired, already used, or malformed. Show one clear
explanation and a single primary action: **Request a new link** → [A], with the email
prefilled if known.

Do **not** distinguish "expired" from "already used" in the copy. ⚠️ CONFIRM whether
the backend distinguishes them; if it does, collapse them into one message anyway.

### [F] Success

⚠️ CONFIRM which behavior web implements:

- **Option 1 — auto sign-in.** Backend returns a session on successful reset. Smoother;
  store tokens and route to the main app.
- **Option 2 — return to login.** Show a success toast and route to the login screen
  with email prefilled.

Mirror web. If web auto-signs-in and mobile does not, users will report it as a bug.

🔒 SECURITY: on success, **all other sessions for that account are revoked**
server-side. This is the whole point of a reset following a compromise. ⚠️ CONFIRM the
backend does this; if it does not, raise it as a security finding rather than
implementing around it.

---

## API contract

⚠️ CONFIRM every route and field below.

### Request reset

```http
POST /auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

**Response — always `200`, regardless of account existence:**

```json
{ "ok": true }
```

**`429`:**

```json
{ "error": { "code": "RATE_LIMITED", "message": "..." } }
```
with a `Retry-After` header.

### Validate token (optional)

```http
GET /auth/reset-password/validate?token=<token>
```

`200` → `{ "valid": true }` · `400` → `{ "error": { "code": "TOKEN_INVALID" } }`

### Submit new password

```http
POST /auth/reset-password
Content-Type: application/json

{ "token": "<token>", "password": "<new password>" }
```

| Status | `code` | Client action |
|--------|--------|---------------|
| `200` | — | → [F]. Body may contain a session (Option 1) |
| `400` | `TOKEN_INVALID` / `TOKEN_EXPIRED` | → [E] |
| `400` | `PASSWORD_POLICY` | Inline field error |
| `429` | `RATE_LIMITED` | Countdown |

---

## Client state

- No authenticated state exists during this flow — the user is logged out throughout.
- Hold the reset token **in memory only**. Never write it to storage, never to logs.
- Clear the in-memory token on success, on failure, and on flow abandonment.
- Persist only the resend cooldown deadline (a timestamp, not the token).

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Email is not registered | Identical confirmation screen. No email sent. No hint. |
| User requests reset twice | ⚠️ CONFIRM policy: newest token wins and older ones are invalidated, or all remain valid until TTL. Mirror web copy accordingly. |
| Link opened on a device without the app | Web fallback page handles it. Verify the fallback actually works — this is the most common broken path. |
| Link opened while logged in as another user | Log out first, then continue. |
| Link opened twice | First use succeeds; second shows [E]. |
| User backgrounds the app on [D] mid-typing | Preserve typed input on resume. Do not clear the form. |
| Token expires while [D] is open | Submit returns `TOKEN_EXPIRED` → [E]. |
| Account is deactivated (see feature 4) | ⚠️ CONFIRM: reset should still succeed; the account remains deactivated and the user is prompted to reactivate on next sign-in. |
| Account is deleted / in grace period | ⚠️ CONFIRM. Either behave as "no account exists", or allow reset as a recovery path. These are different products decisions — do not guess. |
| OAuth-only account (no password set) | 🔒 Still show the identical confirmation screen. ⚠️ CONFIRM what the backend emails — ideally "you sign in with Google" rather than a reset link. |

---

## Security requirements

🔒 All of the following are mandatory:

1. **No account enumeration.** Identical response, identical copy, identical timing.
2. **Token TTL** short (≤ 60 min) and **single-use**.
3. **Token never logged** — not in console, crash reports, analytics, or breadcrumbs.
4. **All other sessions revoked** on successful reset.
5. **Rate limited** per email *and* per IP, server-side. Client cooldown is UX, not
   enforcement.
6. **No password in query strings** — POST body only.
7. **TLS only.** Reject `http://` deep links outright.
8. **Validate the deep link host** against an allowlist before acting on it. An
   attacker-supplied link with your scheme but a foreign host must be dropped.
9. **Confirmation email** sent to the user after a successful reset ("your password was
   changed") so an unauthorized reset is visible. ⚠️ CONFIRM backend sends this.

---

## Analytics

⚠️ CONFIRM names against web.

| Event | Properties |
|-------|-----------|
| `forgot_password_started` | `source: login \| login_after_failure` |
| `forgot_password_email_submitted` | — |
| `forgot_password_resend_tapped` | `attempt_number` |
| `forgot_password_link_opened` | `cold_start: bool` |
| `forgot_password_token_invalid` | — |
| `forgot_password_completed` | `time_to_complete_ms` |

🔒 Never attach the email address or token as an event property.

---

## Acceptance checklist

- [ ] Unregistered email produces an identical screen to a registered one
- [ ] Resend cooldown survives backgrounding the app
- [ ] Deep link opens the app on **cold start**
- [ ] Deep link opens the app on **warm resume**
- [ ] Deep link falls back to web when the app is not installed
- [ ] Expired token routes to [E], not a field error
- [ ] Reused token routes to [E]
- [ ] Password policy matches web exactly (test the boundary length on both)
- [ ] OS password manager offers to save the new password
- [ ] Other sessions are signed out after reset (verify on a second device)
- [ ] Token appears in no log, crash report, or analytics payload
- [ ] Deep link with a foreign host is rejected
- [ ] Screen reader announces field errors
- [ ] Layout holds at maximum system font size
- [ ] Airplane mode shows a network error with retry, not a validation error
