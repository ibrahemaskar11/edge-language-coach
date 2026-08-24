# 00. Open Questions — resolve before implementation

Every `⚠️ CONFIRM` in this guide, collected in one place. Work through this with the
web and backend owners **before** starting mobile implementation; most of these change
what gets built, not just what it is called.

Fill in the **Answer** column and check the box. An unchecked row is a known unknown,
not a detail to figure out during coding.

---

## Cross-cutting

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 1 | Exact error envelope shape and the full list of stable `code` values | Backend | |
| 2 | Password policy rules, exactly as the web validator enforces them | Web | |
| 3 | Unicode normalization applied to passwords (NFC?) | Backend | |
| 4 | Analytics event names already emitted by web, so funnels join | Web / Data | |
| 5 | Does the backend send transactional emails for password reset, password change, deletion, deactivation? | Backend | |
| 6 | Is TLS pinning in use, and does it cover auth routes? | Mobile / Backend | |

## 1 · Forgot Password

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 7 | Reset link URL pattern and token query-parameter name | Backend | |
| 8 | Token TTL, and is it single-use? | Backend | |
| 9 | Are `apple-app-site-association` and `assetlinks.json` served for the reset path? Who owns that config? | Web / Infra | |
| 10 | Does a validate-token-only endpoint exist? | Backend | |
| 11 | On successful reset — auto sign-in, or return to login? | Web | |
| 12 | Are all other sessions revoked on reset? | Backend | |
| 13 | Requesting a reset twice — does the newest token invalidate older ones? | Backend | |
| 14 | Behavior for a deactivated account | Product | |
| 15 | Behavior for a deleted account / one in the grace period | Product | |
| 16 | What is emailed to an OAuth-only account that requests a reset? | Backend | |

## 2 · Change Password

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 17 | How does the API report whether an account has a password? (`hasPassword`, linked providers, …) | Backend | |
| 18 | Does a set-initial-password endpoint exist for OAuth-only accounts? | Backend | |
| 19 | **Session model after change:** keep this session and revoke others, or revoke all? | Web | |
| 20 | Does the response rotate and return new tokens? | Backend | |
| 21 | **How is "wrong current password" distinguished from "expired access token"?** Both are `401` — is there a distinguishing `code`, or can wrong-password return `403`? | Backend | |
| 22 | Is a recent-password-reuse check enforced? | Backend | |
| 23 | Does the backend support a step-up / biometric attestation, or is the password sent directly? | Backend | |

## 3 · Delete Account

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 24 | **Immediate deletion, or soft with a grace period? If soft, how many days?** | Product | |
| 25 | What is actually deleted vs. anonymized vs. retained? (needed to write truthful copy) | Backend / Legal | |
| 26 | Messages in group conversations — deleted, or retained as "Deleted user"? | Product | |
| 27 | What is retained for legal/fraud/accounting reasons, and for how long? | Legal | |
| 28 | Does an active subscription block deletion? | Product | |
| 29 | Does a data-export feature exist to offer before deletion? | Product | |
| 30 | Re-auth mechanism: password in the delete body, or a short-lived re-auth token? | Backend | |
| 31 | Re-auth for OAuth accounts — does the backend accept a fresh provider token? | Backend | |
| 32 | Is deletion idempotent, so a retry after a dropped connection succeeds? | Backend | |
| 33 | Sole group owner — block with transfer, auto-transfer, or dissolve? | Product | |
| 34 | Re-registering with the same email after deletion — allowed? | Product | |
| 35 | Final-confirmation mechanism: typed word or hold-to-confirm? If typed, what word, and is it localized? | Web | |
| 36 | Reason codes used by web | Web | |
| 37 | Signing in during the grace period — auto-restore or confirm first? | Product | |

## 4 · Deactivate Account

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 38 | **The full semantics table** in [`04-deactivate-account.md`](./04-deactivate-account.md#semantics--settle-these-first) — every row | Product | |
| 39 | Does web require re-authentication to deactivate? | Web | |
| 40 | Does the product offer a deactivation **duration**? | Product | |
| 41 | Reactivation model: explicit prompt (A) or silent on sign-in (B)? | Backend / Product | |
| 42 | Does login return a distinguishable `ACCOUNT_DEACTIVATED` response plus a scoped reactivation token? | Backend | |
| 43 | **How does the API represent a deactivated user in responses — omitted, or a stub?** This determines client work across every screen that renders a user | Backend | |
| 44 | Per-surface rendering of deactivated users: feed, comments, friends list, search, 1:1 chat, group member list, profile deep link | Web | |
| 45 | Are notifications accumulated during deactivation replayed on return? | Backend | |
| 46 | Is there an auto-delete after N days of deactivation? | Product | |
| 47 | Pending friend requests during deactivation — hidden and restored? | Backend | |

## 5 · Friends Suggestion in Feed

| # | Question | Ask | Answer |
|---|----------|-----|--------|
| 48 | **Feed injection cadence** — first position and interval, and max blocks per session | Web | |
| 49 | Minimum suggestion count below which nothing renders | Web | |
| 50 | Horizontal carousel or vertical stack? | Web / Design | |
| 51 | After adding — does the card stay showing `Requested`, or animate out? | Web | |
| 52 | Is add optimistic on web? (prior web work measured ~120ms optimistic updates) | Web | |
| 53 | Dismiss endpoint, and does it persist server-side across devices? | Backend | |
| 54 | Does a "See all" suggestions screen exist on web? | Web | |
| 55 | Which ranking signals exist, and what `reason` types can the API return? | Backend | |
| 56 | Is `reason` returned as a structured object, or a prebuilt English string? (must be structured for localization) | Backend | |
| 57 | Suggestions cache TTL | Backend | |
| 58 | Are contact-based suggestions in scope? If so, consent flow and store-disclosure owner | Product | |
| 59 | May mutual-friend avatars be shown when that friend's list is private? | Product / Legal | |
| 60 | Additional exclusion rules beyond self / friend / pending / blocked / dismissed / deactivated | Product | |
| 61 | Does web track impressions, and with what thresholds? | Web / Data | |

---

## Highest-risk unknowns

If time is short, resolve these six first — each one changes the shape of the
implementation rather than a label:

- **#19 / #20** — session model after a password change. Getting it wrong causes
  spurious logouts or leaves attacker sessions alive.
- **#21** — the `401` ambiguity. Without a distinguishing code, a wrong password logs
  the user out.
- **#24** — immediate vs. grace-period deletion. Changes the flow, the copy, and the
  login path.
- **#41 / #42** — reactivation model. Changes the login flow, which is owned by a
  different part of the app.
- **#43 / #44** — how deactivated users are represented and rendered. This is not a
  settings-screen concern; it touches every surface that renders a person, and is the
  largest hidden scope item in this guide.
- **#9** — universal/app link configuration for the reset path. Owned outside mobile,
  and blocks the forgot-password flow end to end.
