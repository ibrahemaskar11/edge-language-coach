# 1. Forgot Password

**Status:** 🆕 Not built. No reset flow exists in web or gateway.
**Where it lives:** Supabase Auth, client-side. **No gateway route is required.**
**Auth state:** Logged out

---

## Purpose

Lets a user who cannot sign in regain access by proving control of their email address.

---

## What already exists

✅ VERIFIED:

- The web login form has **no** "Forgot password?" link —
  `apps/web/src/components/login-form.tsx` renders email, password, submit, and a link
  to `/register` (line 53). That's all.
- `apps/web/src/lib/auth.ts` exports `signIn`, `signUp`, `signOut`. No reset function.
- There is no `/reset-password` route in `apps/web/src/routes/`.
- The gateway has no auth routes beyond `POST /api/auth/callback`, which only upserts a
  profile row after sign-up (`apps/gateway/src/routes/auth.ts`).

So this is greenfield on both clients. The good news: **Supabase Auth already implements
the whole server side.** No gateway work, no migration, no email infrastructure.

---

## Mechanism — Supabase Auth

Two SDK calls do the work. They exist under the same names in every Supabase SDK
(`supabase-js`, `supabase-flutter`, `supabase-kt`, `supabase-swift`).

```
 [A] User enters email
      │
      │  supabase.auth.resetPasswordForEmail(email, { redirectTo })
      ▼
 [B] Supabase sends the recovery email        ← nothing for you to build
      │
      │  user taps the link
      ▼
 [C] Link → Supabase /auth/v1/verify → redirects to your `redirectTo`
      │     deep link carries a code (PKCE) or tokens (implicit)
      ▼
 [D] SDK establishes a RECOVERY SESSION
      │     onAuthStateChange fires with event "PASSWORD_RECOVERY"
      ▼
 [E] User enters a new password
      │  supabase.auth.updateUser({ password })
      ▼
 [F] Recovery session becomes a full session — user is signed in
```

### 🔒 The Supabase footgun — read this before writing the route guard

At step **[D]** the user has a **real, valid session** before setting any password.
The gateway's `authPlugin` will accept its access token
(`apps/gateway/src/plugins/auth.ts:39` calls `supabase.auth.getUser(token)`, which has
no idea the session came from a recovery link).

The web route guard checks only "is there a user"
(`apps/web/src/routes/_authenticated.tsx:20-22`). A guard written that way means **anyone
holding a recovery link gets full authenticated access without setting a password** —
they just close the reset screen.

Mobile must not reproduce that. Required:

1. On `PASSWORD_RECOVERY`, set a `isRecoverySession` flag in the auth store.
2. While the flag is set, the route guard allows **only** the new-password screen.
   Every other authenticated route redirects back to it.
3. Clear the flag only after `updateUser({ password })` succeeds.
4. If the user abandons the screen, call `signOut()` and clear the flag.

⚠️ CONFIRM whether web will adopt the same rule when it builds this. It should — flag it
to whoever picks up the web side.

---

## Configuration — do this first, it blocks everything

🆕 TO BUILD, in the Supabase dashboard (Auth → URL Configuration → **Redirect URLs**):

| Client | Redirect URL |
|--------|-------------|
| Web (dev) | `http://localhost:5173/reset-password` |
| Web (prod) | `https://<vercel-domain>/reset-password` |
| 📱 Mobile | `edgecoach://reset-password` ⚠️ CONFIRM the app's URL scheme |

A `redirectTo` value not on this allowlist is **silently ignored** and the user lands on
the Supabase site instead. This is the single most common failure in this flow.

📱 Also required on mobile:

- **iOS** — register the scheme in `Info.plist` (`CFBundleURLTypes`), and handle the URL
  in `application(_:open:options:)` / `onOpenURL`.
- **Android** — an `<intent-filter>` with the scheme on the launch activity, and
  `android:launchMode="singleTask"` so a warm app receives it via `onNewIntent` instead
  of spawning a second activity.

⚠️ CONFIRM whether to use a **custom scheme** (`edgecoach://`, simple, works everywhere,
but any app can claim it) or **universal/app links** (`https://<domain>/reset-password`,
verified ownership, falls back to the web page when the app isn't installed). Universal
links are better and require serving `apple-app-site-association` and `assetlinks.json`
from the Vercel domain — an infra task owned outside mobile. Budget for it.

⚠️ CONFIRM the Supabase project's **PKCE vs implicit** flow setting. PKCE is the default
for mobile SDKs and the correct choice: the deep link carries a short-lived `code`
exchanged for a session, rather than putting tokens in a URL fragment. 🔒 Prefer PKCE.

⚠️ CONFIRM the recovery-token TTL (Supabase default is **1 hour**; configurable) and
state it accurately in the [B] copy.

---

## Flow

### [A] Request screen

New screen, reached from a new **"Forgot password?"** link on the login form — place it
under the password field, matching the existing `text-sm` link style used for
"Don't have an account? Sign up" (`login-form.tsx:50-54`).

**Field:** email only.

- Reuse the email validator already in the login form (`login-form.tsx:62-69`):
  required, then `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Same regex, same messages — parity is
  free here, take it.
- 📱 `keyboardType="email-address"`, `autoCapitalize="none"`, `autoCorrect={false}`,
  `autoComplete="email"`.
- **Prefill from the login screen** if the user already typed an email. Highest-value
  detail on this screen.

**Call:**

```ts
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: "edgecoach://reset-password",
});
```

**States:** `idle` → `submitting` (disabled button + inline spinner, per
`login-form.tsx:120-123`) → navigate to [B] | `error`.

| Condition | Display |
|-----------|---------|
| Empty / malformed email | Inline field error (web convention: red text under input) |
| Supabase rate limit | Snackbar + cooldown countdown |
| Network failure | Snackbar with Retry |

### [B] Confirmation screen

🔒 `resetPasswordForEmail` returns **no error for an unregistered email** — Supabase
does not leak account existence. Do not add a check that reintroduces the leak.

> **Check your email**
> If an account exists for `you@example.com`, we've sent a link to reset your password.
> The link expires in 60 minutes. ⚠️ CONFIRM the configured TTL.

Controls:

- **Open mail app** — 📱 `message://` (iOS) / `ACTION_MAIN` + `CATEGORY_APP_EMAIL`
  (Android). Capability-check and hide the button if nothing handles it.
- **Resend** — disabled behind a cooldown. ⚠️ CONFIRM the Supabase project's auth email
  rate limit (default is roughly one per 60s per address) and set the client cooldown to
  match. Persist the deadline so backgrounding doesn't reset it.
- **Back to sign in**

### [C]/[D] Deep link handoff — 📱 MOBILE-ONLY

The hard part. Requirements:

- Handle the link on **cold start** and **warm resume**. Cold start is where this breaks:
  the URL arrives before the navigation tree mounts. Buffer the pending link and replay
  it once navigation is ready.
- Let the SDK process the URL. With PKCE and the SDK's deep-link support configured, it
  exchanges the code and emits `PASSWORD_RECOVERY` through `onAuthStateChange` — the
  same listener the web app already registers (`apps/web/src/lib/auth.ts:29`), which
  currently ignores the event type (`_event` is unused). Mobile must **not** ignore it:

```ts
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    setRecoverySession(true);      // gates the route guard — see the footgun above
    navigateTo("/reset-password");
    return;
  }
  setAuth(session);
});
```

- 🔒 Validate the deep link's scheme/host against an allowlist before acting. Drop
  anything else.
- 🔒 Never log the URL — it carries a credential. Strip it from crash breadcrumbs and
  analytics.

### [E] New password screen

**Fields:** new password, confirm new password.

- 📱 `textContentType="newPassword"` / `autoComplete="new-password"` so the OS password
  manager offers to generate and save.
- Visibility toggle on both.
- Live policy checklist — see [Password policy](./README.md#password-policy). ⚠️ Note the
  effective policy today is Supabase's 6-character default; agree the real rule first.
- Submit disabled until both non-empty and matching.

**Call:**

```ts
const { error } = await supabase.auth.updateUser({ password: newPassword });
```

| Supabase error | Display |
|----------------|---------|
| `Password should be at least N characters` | Inline on new password |
| `New password should be different from the old password` | Inline on new password |
| Session missing / expired (recovery link stale) | Route to [G] |
| Rate limited | Cooldown |

⚠️ Supabase returns these as message strings, not codes. Match on
`error.status` plus a substring, and keep the matching in **one** mapping function so it
is easy to fix when Supabase changes wording.

### [F] Success

With Supabase, `updateUser` on a recovery session leaves the user **signed in**. So:

- Clear `isRecoverySession`.
- Show a success toast (`toast.success` is the web convention) and navigate to the main
  app — matching what `signIn` does (`login-form.tsx:23-24`, navigates to `/playground`).
- Onboarding still applies: the route guard sends the user to onboarding if
  `onboardingCompleted` is false (`_authenticated.tsx:26-30`). Mobile must mirror that.

🔒 ⚠️ CONFIRM whether other sessions are revoked. Supabase's behavior depends on the
project's session settings; the default does **not** necessarily revoke other refresh
tokens on password update. If it doesn't, a reset after a compromise leaves the attacker
signed in — which defeats the purpose. Options: enable the project setting if available,
or add a gateway route that calls
`supabase.auth.admin.signOut(userId, "global")` with the service-role client
(`apps/gateway/src/plugins/supabase.ts` already creates one) and have the client call it
after a successful reset.

### [G] Invalid / expired link screen

One explanation, one primary action: **Request a new link** → [A], email prefilled.

Do not distinguish "expired" from "already used".

---

## Client state

- No app state exists before [D]; a **recovery** session exists between [D] and [F].
- `isRecoverySession` is the only new persistent-ish flag, and it lives in the in-memory
  auth store — not on disk. If the app is killed mid-flow, the user restarts from the
  email link.
- 🔒 Never persist the recovery code or tokens yourself; let the SDK own the session.
- On abandonment: `signOut()` + clear the flag.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Email not registered | Identical [B] screen. No email sent. No hint. ✅ Supabase handles this |
| Link opened with the app already signed in as another user | 🔒 The SDK **replaces** the session with the recovery session. Detect via `PASSWORD_RECOVERY` and treat as a fresh recovery — do not merge with prior state |
| Link opened twice | Second attempt fails → [G] |
| App not installed (universal links) | Web `/reset-password` page handles it. 🆕 That page does not exist yet — it must be built alongside, or the fallback is a dead end |
| App not installed (custom scheme) | 🔒 Nothing opens; the user is stranded. Another argument for universal links |
| Recovery session established, user force-quits | Session may persist in SDK storage → next launch the guard must still see `isRecoverySession`. Simplest correct behavior: on cold start with no in-memory flag, `signOut()` and require a fresh link |
| Token expires while [E] is open | `updateUser` fails → [G], with the typed password discarded |
| User requests two resets | ⚠️ CONFIRM Supabase behavior for the project; treat only the newest link as reliable in the copy |
| Onboarding incomplete | Guard routes to `/onboarding` after [F], per the existing web rule |

---

## Security requirements

🔒 Mandatory:

1. **Recovery sessions are gated** — the route guard must not treat them as normal auth.
   This is the highest-severity item in this document.
2. **No enumeration** — do not add existence checks around Supabase's silent behavior.
3. **PKCE flow**, not implicit, so tokens never ride in a URL fragment.
4. **Deep link scheme/host allowlisted** before processing.
5. **Never log the deep link URL**, in any form.
6. **Session storage encrypted** — see [Auth](./README.md#authentication); the RN
   default is not.
7. **Other sessions revoked** on success — verify, and build the admin route if not.
8. **Redirect URL allowlist** kept tight in the Supabase dashboard; no wildcards.

---

## Work breakdown

| Task | Owner | Blocking? |
|------|-------|-----------|
| Supabase redirect URL allowlist entries | Backend/infra | 🔴 Yes |
| Decide custom scheme vs universal links | Product/infra | 🔴 Yes |
| `apple-app-site-association` + `assetlinks.json` (if universal links) | Infra | 🔴 Yes |
| Confirm PKCE flow enabled | Backend | 🔴 Yes |
| Agree the password policy | Product | 🟡 Soon |
| Web `/reset-password` page (universal-link fallback) | Web | 🟡 Soon |
| "Forgot password?" link on login | Web + Mobile | |
| Screens [A], [B], [E], [G] | Mobile | |
| `PASSWORD_RECOVERY` handling + guard gating | Mobile | |
| Global sign-out route, if Supabase doesn't revoke | Gateway | |

---

## Acceptance checklist

- [ ] Unregistered email produces an identical screen to a registered one
- [ ] 🔒 A recovery session cannot reach any screen except [E]
- [ ] 🔒 Abandoning [E] signs the user out
- [ ] Deep link opens the app on **cold start**
- [ ] Deep link opens the app on **warm resume**
- [ ] Deep link with a foreign scheme/host is rejected
- [ ] Resend cooldown survives backgrounding
- [ ] Expired link routes to [G], not a field error
- [ ] Reused link routes to [G]
- [ ] OS password manager offers to save the new password
- [ ] After success the user lands in the app, or in onboarding if incomplete
- [ ] Other devices are signed out (verify on a second device)
- [ ] Link URL appears in no log, crash report, or analytics payload
- [ ] Session is stored in Keychain/Keystore, not plaintext
- [ ] Airplane mode shows a network error with retry, not a validation error
