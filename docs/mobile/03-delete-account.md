# 3. Delete Account

**Auth state:** Logged in + re-authentication
**Depends on:** Local wipe, push deregistration
**Pairs with:** [Deactivate Account](./04-deactivate-account.md) — read both before
building either

---

## Purpose

Permanently removes the user's account and personal data. Irreversible (or reversible
only within a defined grace period).

📱 **This is not optional on mobile.** Both app stores require it:

- **Apple** — App Store Review Guideline **5.1.1(v)**: an app that supports account
  creation must let the user **initiate account deletion from within the app**. A link
  to a website is not sufficient on its own; the in-app path must exist. Apps have been
  rejected for burying this or offering only a "contact support" route.
- **Google Play** — the **Data deletion** policy requires an in-app deletion path *and*
  a publicly reachable web URL for requesting deletion, both declared in the Play
  Console Data safety form.

So even if web treats this as a low-priority settings item, mobile must ship it as a
first-class, discoverable flow. Budget for it accordingly.

---

## Delete vs. deactivate

Get this distinction right before writing any code — users conflate them, and shipping
one when the product wanted the other destroys data.

| | Deactivate | Delete |
|---|---|---|
| Reversible | Yes, any time | No (or only within a grace period) |
| Data retained | Yes, hidden | No — erased or anonymized |
| Profile visible | No | No |
| Content (posts, messages) | Hidden, restored on return | Removed or anonymized |
| Recovery | Sign in again | Not possible after grace period |
| Typical intent | "I need a break" | "Remove me from this product" |

The delete screen must **offer deactivation as an alternative** before the user
commits. This is both good product design and materially reduces support load.
⚠️ CONFIRM web does the same and mirror its copy.

---

## Entry points

| Location | Control |
|----------|---------|
| Settings → Account | "Delete account" — last row in the section, styled destructive (red) |

Requirements:

- Must be reachable in **at most 3 taps** from the app's main screen. Store reviewers
  check this. Settings → Account → Delete account is exactly 3.
- Do **not** hide it behind a "Danger zone" accordion that starts collapsed.
- Do **not** make it a web link. It must run in-app.

---

## Flow

```
Settings ──► [A] What happens screen
                   │ Continue
                   ▼
             [B] Re-authenticate  (password or provider)
                   │ verified
                   ▼
             [C] Reason (optional)
                   │
                   ▼
             [D] Final confirmation  (typed / hold-to-confirm)
                   │ confirmed
                   ▼
             [E] Processing ──► local wipe ──► logged-out stack
                   │
                   └─ (if grace period) [F] Recovery notice
```

Four screens for a destructive irreversible action is correct, not excessive. Do not
compress this into a single alert dialog.

### [A] "What happens" screen

The most important screen in the flow. It must be **specific**, not a generic warning.

Structure:

> **Delete your account**
>
> **This will permanently remove:**
> - Your profile, photo, and account details
> - Your posts, comments, and reactions
> - Your friends and friend requests
> - Your messages *(⚠️ CONFIRM: in group conversations, are your messages deleted, or
>   retained and shown as "Deleted user"? These are very different promises — state
>   whichever is true)*
> - Your saved and liked content
>
> **This will not be removed:**
> - *(⚠️ CONFIRM with backend/legal: records retained for legal, fraud-prevention,
>   or accounting obligations, and for how long)*
>
> **This cannot be undone.** *(or: "You can restore your account within 30 days by
> signing in.")*

Also on this screen:

- **"Just need a break? Deactivate instead"** → routes to
  [Deactivate](./04-deactivate-account.md).
- ⚠️ CONFIRM whether active subscriptions block deletion or must be cancelled first.
  📱 MOBILE-ONLY and important: an in-app-purchase subscription bought through Apple or
  Google is **not** cancelled by deleting the account. If the user has one, say so
  explicitly and deep link to the store's subscription management
  (`https://apps.apple.com/account/subscriptions`,
  `https://play.google.com/store/account/subscriptions`). Users who delete an account
  and keep getting charged file chargebacks and one-star reviews.
- 📱 MOBILE-ONLY: if the user has data worth keeping and an export feature exists, offer
  "Download your data" here. ⚠️ CONFIRM whether one exists.

**Controls:** `Continue` (destructive styling) and `Cancel` (prominent).

### [B] Re-authenticate

🔒 SECURITY: mandatory. An unattended unlocked phone must not be able to delete an
account. This is the single most important control in the flow.

| Account type | Challenge |
|--------------|-----------|
| Password | Enter current password |
| OAuth (Google/Apple) | Re-run the provider sign-in and send the fresh token ⚠️ CONFIRM backend accepts this |
| Either | 📱 Biometric **only** as an additive convenience on top of a server-verified challenge, never as a replacement |

Errors mirror [Change Password](./02-change-password.md#errors): wrong password is
inline and rate limited.

⚠️ CONFIRM the mechanism: does the backend expect the password in the delete request
body, or a short-lived re-auth token obtained from a separate step-up endpoint? The
latter is better; use whatever web uses.

### [C] Reason (optional)

Single-select list plus optional free text. Must be genuinely skippable — a "Skip"
control of equal visual weight to "Continue".

⚠️ CONFIRM the reason codes web uses so analytics are comparable across platforms.

🔒 Never block deletion on providing a reason.

### [D] Final confirmation

Requires a deliberate, non-accidental action. Pick **one** and match web:

- **Typed confirmation** — user types `DELETE` (or their username). Most explicit; also
  the most accessible. ⚠️ CONFIRM the exact expected string and whether matching is
  case-sensitive. If localized, the expected word must be localized too — do not force
  a user reading Arabic to type an English word.
- **Hold to confirm** — press and hold ~3s with a progress ring. Slick, but harder for
  users with motor impairments; if used, provide a typed fallback.

Never use a plain two-button alert here.

Copy: restate irreversibility one final time, in one short sentence.

### [E] Processing

- Full-screen, non-dismissable, with a spinner.
- Disable the hardware/gesture back navigation.
- On success → [local wipe](./README.md#local-wipe) → reset navigation to the
  logged-out stack → show a confirmation toast or screen.

**Push deregistration ordering matters:** deregister the push token server-side
*before* the delete request completes, or ensure the backend clears device tokens as
part of deletion. A deleted account whose device still receives notifications is a
privacy incident.

**On failure:** show the error with Retry and Cancel. Do **not** wipe local state — the
account still exists.

### [F] Grace period notice (if applicable)

⚠️ CONFIRM whether deletion is immediate or soft with a recovery window (30 days is a
common choice).

If a grace period exists:

- State the exact deadline on the confirmation screen: "Your account will be
  permanently deleted on 24 September 2026. Sign in before then to restore it."
- ⚠️ CONFIRM what signing in during the window does — auto-restore, or restore behind a
  confirmation prompt. Implement the latter if the choice is open; an accidental sign-in
  should not silently undo an intentional deletion.
- The user must still be fully signed out and locally wiped now.

---

## API contract

⚠️ CONFIRM route, method, and fields.

### Optional step-up

```http
POST /auth/reauthenticate
Authorization: Bearer <accessToken>
{ "password": "<current>" }
```
→ `200 { "reauthToken": "<short-lived>" }`

### Delete

```http
DELETE /account
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reauthToken": "<from step-up>",   // or "password": "<current>"
  "reason": "NOT_USEFUL",            // optional
  "feedback": "free text"            // optional
}
```

**`200`:**

```jsonc
{
  "ok": true,
  "deletionType": "immediate",        // or "scheduled"
  "permanentDeletionAt": "2026-09-24T00:00:00Z"  // present when scheduled
}
```

| Status | `code` | Client action |
|--------|--------|---------------|
| `401` / `403` | `REAUTH_REQUIRED` / `INVALID_CREDENTIALS` | Back to [B] with inline error |
| `409` | `SUBSCRIPTION_ACTIVE` | Explain and deep link to store subscription management |
| `429` | `RATE_LIMITED` | Countdown |
| `5xx` | — | Retry; **do not** wipe locally |

---

## Client state

- On success: full [local wipe](./README.md#local-wipe) — every item on that list.
- Reset the navigation stack; the authenticated screens must be unreachable via back.
- Reset the analytics identity (`reset()`), then optionally emit the deletion event
  anonymously.
- 📱 Clear the OS password-manager association if you created one? No — leave saved
  credentials alone. That entry belongs to the user, not the app.
- Clear any biometric-unlock enrollment tied to the account.

---

## Edge cases

| Case | Expected behavior |
|------|-------------------|
| Active IAP subscription | Warn, deep link to store management. ⚠️ CONFIRM whether the backend blocks or allows |
| Network drops during [E] | Show retry. Do not wipe. On retry, deletion must be **idempotent** — a second call for an already-deleted account should return success, not a confusing `404`. ⚠️ CONFIRM |
| User is the sole admin/owner of a group | ⚠️ CONFIRM: block with an explanation and a transfer-ownership path, or auto-transfer, or dissolve the group. Must not orphan the group |
| User has pending friend requests | Removed silently on both sides |
| Deletion while another device is signed in | That device's next request 401s → forced logout |
| User signs in during the grace period | See [F] |
| User re-registers with the same email after deletion | ⚠️ CONFIRM: fresh account with no prior data, or blocked until permanent deletion completes |
| App killed during [E] | On next launch the token is invalid → forced logout → clean state |
| Deletion request succeeds but the response is lost | Next launch 401s → logout. Acceptable |
| Account already deactivated | ⚠️ CONFIRM: deletion should still be reachable, likely requiring reactivation first or accepting the deactivated session |

---

## Security requirements

🔒 All mandatory:

1. **Re-authentication required**, verified server-side. Never a local-only check.
2. **Rate limited** on the re-auth challenge.
3. **Confirmation email** on deletion (or scheduled deletion), including the recovery
   deadline if any. This is the user's only alert if the deletion was unauthorized.
   ⚠️ CONFIRM backend sends it.
4. **All sessions revoked** immediately — every device, not just this one.
5. **Push tokens deregistered** for the account across all devices.
6. **Complete local wipe** — a partial wipe leaking cached friends or messages after
   deletion is a privacy bug.
7. **Idempotent** server-side, so retries are safe.
8. ⚠️ CONFIRM with whoever owns privacy compliance what "deleted" means in the
   backend — hard delete, anonymization, or tombstone — and make the copy in [A]
   truthful. Do not promise erasure the backend does not perform.

---

## Analytics

| Event | Properties |
|-------|-----------|
| `delete_account_opened` | `source: settings` |
| `delete_account_alternative_shown` | — |
| `delete_account_deactivate_chosen` | — (measures how many the alternative diverts) |
| `delete_account_reauth_failed` | — |
| `delete_account_reason_selected` | `reason` |
| `delete_account_confirmed` | `deletion_type: immediate \| scheduled` |
| `delete_account_abandoned` | `step: A \| B \| C \| D` |

🔒 Emit the final event **before** resetting the analytics identity, then reset.

---

## Acceptance checklist

- [ ] Reachable within 3 taps from the main screen (store requirement)
- [ ] In-app, not a web link (store requirement)
- [ ] "What happens" screen lists specific data, not a generic warning
- [ ] Deactivate is offered as an alternative
- [ ] Re-authentication is enforced and verified server-side
- [ ] Wrong password at [B] shows an inline error and does not delete
- [ ] Reason step is genuinely skippable
- [ ] Final confirmation requires a deliberate action, not one tap
- [ ] Typed-confirmation word is localized in every supported language
- [ ] Back navigation is disabled during processing
- [ ] Failure does **not** wipe local state
- [ ] Success performs a **complete** local wipe (verify caches on disk)
- [ ] Push notifications stop arriving on the device
- [ ] Other devices are signed out
- [ ] Confirmation email arrives
- [ ] Retrying after a dropped connection does not error
- [ ] IAP subscription warning appears when one is active
- [ ] Grace-period deadline shown accurately, if applicable
- [ ] Sole-group-owner case behaves per the confirmed policy
- [ ] Screen reader reads the destructive warning before the confirm control
