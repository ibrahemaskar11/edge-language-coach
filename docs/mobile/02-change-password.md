# 2. Change Password

**Status:** 🆕 Not built.
**Where it lives:** Supabase Auth client-side, **plus** a new gateway route for
re-authentication (see below).
**Auth state:** Logged in

---

## Purpose

Lets a signed-in user replace their password. Distinct from
[Forgot Password](./01-forgot-password.md), which is for users who cannot sign in.

---

## What already exists

✅ VERIFIED:

- No settings or account screen exists in the web app at all. Routes under
  `apps/web/src/routes/` are: login, register, onboarding, and `playground/*`
  (topics, chats, flashcards, reports, session). There is no `/settings`.
- The sidebar (`apps/web/src/components/app-sidebar.tsx`) has no account section.
- `apps/web/src/lib/auth.ts` has no password-change function.

So features 2, 3, and 4 all need a **settings surface that does not exist yet**. Build
it once; all three live in it.

⚠️ CONFIRM the settings information architecture with design before building three
screens that have nowhere to go. Minimum viable: `Settings → Account` containing
*Change password*, *Deactivate account*, *Delete account*.

---

## 🔒 The critical gap: Supabase does not verify the current password

`supabase.auth.updateUser({ password })` changes the password **using only the existing
session**. It does not ask for, or check, the current password.

That means a naive implementation lets anyone holding an unlocked phone change the
account password and lock the owner out. 🔒 This is not acceptable for a change-password
flow, and it is the main reason this feature needs backend work at all.

Two ways to close it:

**Option A — client-side re-auth (no backend work).**
Before updating, call `signInWithPassword({ email, password: currentPassword })` and
require it to succeed.

- ✅ No gateway changes.
- ❌ The check is client-side; a modified client can skip it.
- ❌ Consumes Supabase auth rate limit and issues a fresh session as a side effect.

**Option B — gateway-verified re-auth (recommended). 🆕 TO BUILD.**
Add a route that verifies the password server-side using the service-role client that
already exists (`apps/gateway/src/plugins/supabase.ts`), then performs the update via
`auth.admin.updateUserById`.

```ts
// apps/gateway/src/routes/account.ts  🆕
fastify.post("/api/account/change-password", async (request, reply) => {
  let body;
  try {
    body = changePasswordSchema.parse(request.body);   // 🆕 in @edge/shared
  } catch (err) {
    if (err instanceof ZodError) {
      return reply.status(400)
        .send({ message: "Validation error", errors: err.flatten().fieldErrors });
    }
    throw err;
  }

  // Verify the current password against the authenticated user's email.
  const check = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { error: authError } = await check.auth.signInWithPassword({
    email: request.userEmail,                 // set by authPlugin:46
    password: body.currentPassword,
  });
  if (authError) {
    return reply.status(401).send({
      message: "Current password is incorrect.",
      code: "INVALID_CREDENTIALS",            // 🆕 see the error-model note below
    });
  }

  const { error } = await fastify.supabase.auth.admin.updateUserById(
    request.userId, { password: body.newPassword }
  );
  if (error) return reply.status(400).send({ message: error.message });

  return reply.send({ ok: true });
});
```

Register it in `apps/gateway/src/server.ts` alongside the other route plugins. It is
**not** added to the `authPlugin` allowlist — it requires a valid session, by design.

> **🆕 The error-model addition matters most here.** `authPlugin` already returns `401`
> for an expired token (`plugins/auth.ts:42`). If wrong-current-password also returns a
> bare `401 { message }`, the mobile HTTP client cannot tell them apart and will log the
> user out on a typo. Either return the `code` field as above, or use **`403`** for
> wrong-password so the status alone disambiguates. Pick one and write it down.
> ⚠️ CONFIRM which.

Everything below assumes **Option B**.

---

## Entry points

| Location | Control |
|----------|---------|
| Settings → Account | "Change password" row |

**Visibility rule** — hide or transform the row for accounts with no password.

Supabase exposes this on the user object: `user.identities` (an array of linked
providers) and `user.app_metadata.provider` / `providers`. An account created with
`signUp({ email, password })` — the only path this app currently has
(`apps/web/src/lib/auth.ts:47`) — has an `email` identity, so every existing user has a
password today.

⚠️ CONFIRM whether OAuth sign-in is planned. If it is, this row must become "Set
password" for provider-only accounts, calling `updateUser({ password })` **without** a
current-password step (the provider session is the proof). If OAuth is not planned,
skip that branch entirely rather than building dead code.

---

## Flow

```
Settings ──► [A] Change password form
                     │ POST /api/account/change-password
                     ▼
             ┌───────┴────────┐
        200                  4xx
             │                │
             ▼                ▼
        [B] Success      inline error on the offending field
```

### [A] Form

**Fields, in order:** current password · new password · confirm new password.

- 📱 `textContentType`: `password`, `newPassword`, `newPassword`.
- Independent visibility toggle per field.
- Live policy checklist under *new password* — see
  [Password policy](./README.md#password-policy).
- Submit enabled only when all three are non-empty and fields 2 and 3 match.
- **"Forgot your current password?"** → routes into
  [Forgot Password](./01-forgot-password.md). Without it this screen is a dead end for
  exactly the users who need it.
- Follow the web form conventions from `login-form.tsx`: validators on blur, red inline
  error text under the field, disabled submit with an inline spinner while pending, and
  a `sonner`-style toast on success.

**States:** `idle` → `submitting` → `success` | `error`.

### Errors

| Condition | Response | Display |
|-----------|----------|---------|
| Confirm mismatch | *client-side* | Inline on confirm |
| New fails policy | `400` + `errors` map | Inline on new password |
| Current password wrong | `401` + `code: INVALID_CREDENTIALS` (or `403`) | Inline on **current password** — 🔒 must **not** log the user out |
| Access token expired | `401 { message: "Invalid token" }` from `authPlugin:42` | Refresh via the SDK, retry once, then sign out |
| New == current | Supabase rejects; `400` | Inline on new password |
| Rate limited | `429` + `Retry-After` | Cooldown countdown |
| Network | — | Snackbar + Retry |

⚠️ The `401` collision is the thing to get right. See the error-model note above.

### [B] After success

⚠️ CONFIRM whether other sessions should be revoked. Supabase's
`admin.updateUserById` does **not** revoke other refresh tokens by default.

🔒 Recommended: revoke them. In the same route, after a successful update:

```ts
await fastify.supabase.auth.admin.signOut(request.userId, "others");
```

⚠️ CONFIRM the scope argument supported by the installed `@supabase/supabase-js` version
(`others` vs `global`) — `global` would sign out the calling device too, which changes
the client behavior below.

**Client behavior under "revoke others":**

- The calling device keeps its session — no token juggling needed, because the change
  went through the gateway rather than mutating the local session.
- Toast: "Password changed. You've been signed out on other devices."
- Navigate back to Settings.

**Client behavior if "global" is used instead:** perform a full
[local wipe](./README.md#local-wipe) and route to login with the email prefilled.

Pick one. Do not let web and mobile diverge here.

---

## API contract 🆕

```http
POST /api/account/change-password
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{ "currentPassword": "...", "newPassword": "..." }
```

Request body is camelCase, matching the repo convention (`routes/profile.ts`).
Schema belongs in `packages/shared/src/schemas.ts`:

```ts
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,     // 🆕 shared policy — see README
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

| Status | Body | Client action |
|--------|------|---------------|
| `200` | `{ "ok": true }` | Toast + back to Settings |
| `400` | `{ "message": "Validation error", "errors": {...} }` | Inline field errors from `errors` |
| `401` | `{ "message": "...", "code": "INVALID_CREDENTIALS" }` | Inline on current password |
| `401` | `{ "message": "Invalid token" }` | Refresh, retry once, else sign out |
| `429` | rate-limit body + `Retry-After` | Cooldown |
| `500` | `{ "message": "<raw supabase error>" }` | Generic message; 🔒 do not render verbatim |

---

## Client state

- Passwords live in local component state only. Never in the auth store, never
  persisted, never in a draft/autosave mechanism.
- Clear all three fields on unmount, on success, **and on app background**.
- 📱 Set the OS secure-screen flag while this screen is mounted — `FLAG_SECURE` on
  Android; blur or overlay the window on `willResignActive` on iOS — so the app-switcher
  snapshot cannot capture typed credentials.
- No query-cache invalidation is needed: no cached data changes. (If a "devices" or
  "security" screen is ever added, invalidate it here.)

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Password manager autofills all three fields identically | Detect new == current client-side and keep submit disabled |
| App backgrounded mid-form | Fields cleared on resume, with a short note rather than silent loss |
| Token expires between screen load and submit | SDK refresh, retry once, transparent |
| Two devices change the password concurrently | The second fails with `INVALID_CREDENTIALS` (its "current" is stale) — normal inline error |
| 64+ character generated password | Must be accepted unmodified. 🔒 Never truncate |
| Unicode / emoji password | Accepted. ⚠️ CONFIRM Supabase's normalization and keep client input unmodified |
| User is deactivated (feature 4) | 🆕 The route should reject — add the deactivation check to the shared guard, see [feature 4](./04-deactivate-account.md) |
| Rate limit hit via the gateway's 60/min | Cooldown; note this budget is shared app-wide (`server.ts:68`) |

---

## Security requirements

🔒 Mandatory:

1. **Current password verified server-side.** Option A (client-only) is a stopgap, not
   an implementation.
2. **Other sessions revoked** on success.
3. **Wrong-password distinguishable from expired-token** by the client, via `code` or a
   distinct status. Otherwise typos cause logouts.
4. **Rate limited.** ✅ The gateway's global 60/min applies (`server.ts:66-79`); ⚠️ CONFIRM
   whether a tighter per-route limit is warranted for a credential check — it is.
5. **Never log** any of the three values — not in network inspectors shipped in release
   builds, not in crash breadcrumbs.
6. 📱 **Secure-screen flag** while the form is mounted.
7. **No stored password** anywhere in the app. No "remember password" feature.
8. **Confirmation email** on change. ⚠️ CONFIRM — Supabase sends one for email changes;
   for password changes it depends on project settings. If it doesn't, the account owner
   gets no signal that their password was changed by someone else.

---

## Work breakdown

| Task | Owner | Blocking? |
|------|-------|-----------|
| Settings screen / IA | Design + Web + Mobile | 🔴 Yes |
| Decide Option A vs B (recommend B) | Backend | 🔴 Yes |
| Decide `code` field vs `403` for wrong password | Backend | 🔴 Yes |
| `POST /api/account/change-password` route | Gateway | 🔴 Yes |
| `changePasswordSchema` + `passwordSchema` in `@edge/shared` | Shared | 🔴 Yes |
| Decide revoke-others vs revoke-global | Product/Backend | 🟡 Soon |
| Confirmation email on change | Backend | 🟡 Soon |
| Form screen | Mobile (+ Web for parity) | |

---

## Acceptance checklist

- [ ] 🔒 Wrong current password shows an inline error and does **not** sign the user out
- [ ] 🔒 A signed-in session alone cannot change the password without the current one
- [ ] New == current is rejected with a clear message
- [ ] Policy matches web exactly at the boundary (test min length ±1 on both)
- [ ] 64+ character password accepted unmodified
- [ ] OS password manager offers to update the saved entry
- [ ] Other devices are signed out (verify on a second device)
- [ ] Confirmation email arrives
- [ ] Fields clear when the app is backgrounded
- [ ] App-switcher snapshot shows no typed characters
- [ ] "Forgot your current password?" routes into the reset flow
- [ ] `429` produces a countdown, not a generic error
- [ ] `500` does not render the raw Supabase message
- [ ] Screen reader announces which field failed
- [ ] Airplane mode shows a network error, not "incorrect password"
