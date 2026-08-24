# Sociaity port brief — how to finish this guide against the right codebase

> **Status: blocked in this session.** The five features were documented against
> **Edge Language Coach** (this repository), not against **Sociaity**. Sociaity's backend
> and website are not reachable from a session scoped to `ibrahemaskar11`. This document
> is the handoff so a correctly-scoped session can produce the Sociaity guide in one pass.

---

## 1. What is blocked, precisely

| Check | Result |
|-------|--------|
| `list_repos` for the connected GitHub account | 39 repos, **no Sociaity repository among them** |
| `add_repo sociaity/sociaity-backend` | `cross-tier adds are not supported in v1: session already has repos from owner(s) [ibrahemaskar11]` |
| Peer Claude sessions reachable for a relay | none running |
| Transcript access to earlier Sociaity sessions | no tool exposes another session's transcript |

Two independent walls, so neither alone is the fix:

1. **Session scope.** A session may only hold repos from the owner it started with. A
   Sociaity repo has to be the *initial source* of a new session — it can never be added
   to this one.
2. **Connector grant.** `list_repos` returns everything the Claude GitHub connector can
   see for this account, and Sociaity is not in it. Even a fresh session would 404 until
   the repositories are granted.

### Unblocking, in order

1. Grant the Claude GitHub connector access to the Sociaity repositories —
   org owner: <https://claude.ai/admin-settings/claude-tag>; personal account:
   claude.ai → Settings → Connectors → reconnect GitHub.
2. Start a **new session** with the Sociaity **backend** as the initial repository.
3. In that session, `add_repo` the Sociaity **web** repository (same owner — allowed).
4. Paste §2 below.

---

## 2. Paste-ready task prompt

> Write a mobile implementation guide for five features: Forgot Password, Change
> Password, Delete Account, Deactivate Account, and Friends Suggestion in Feed.
>
> Ground every claim in this repository and in the Sociaity web app. The audience is a
> mobile engineer who has never opened either codebase and must ship behaviour that
> matches the website exactly. For each feature, document what the web app already does
> and cite it to `file:line`; then specify the mobile client work against that same
> backend contract. Where the backend has no route for something the mobile client needs,
> say so explicitly and specify the route to add in the repository's existing style.
>
> Follow the structure, markers, and extraction checklist in §3–§5 of
> `SOCIAITY-PORT-BRIEF.md`. Never state an endpoint, field name, table, or status code
> you have not read in the source — if it is not in the source, it is a `🆕 TO BUILD` or a
> `⚠️ CONFIRM`, not a fact.

---

## 3. Extraction checklist — read before writing a line

### 3.0 Conventions (shared Part 1, do this first)

Everything below is per-feature-independent and every feature document depends on it.

| # | Extract | From |
|---|---------|------|
| 1 | Auth mechanism — who mints tokens, who verifies, header name, refresh strategy | backend auth middleware/guard |
| 2 | Token lifetimes, and whether refresh tokens rotate | auth config |
| 3 | Route prefix, base URLs per environment, and how web resolves them (proxy? env var?) | server bootstrap + web env config |
| 4 | Unauthenticated route allowlist | auth middleware |
| 5 | Error envelope — exact JSON shape, and **whether a stable error `code` exists** | error handler + web's fetch wrapper |
| 6 | Status codes actually emitted, and any inconsistent ones | route handlers |
| 7 | Case convention on the wire (camel vs snake), and where it is transformed | serializers |
| 8 | Validation library and the 400 body it produces | request schemas |
| 9 | Rate limits — global and per-route, and the key they use | rate-limit config |
| 10 | Whether the client may talk to the database directly, or must go through the API | RLS policies / DB access layer |
| 11 | Client cache library, query keys, and invalidation on auth changes | web data layer |
| 12 | Route guard sequence on the web (loading → login → onboarding → render) | web router |
| 13 | Form conventions — validation timing, error display, submit disabling, toasts | a representative web form |
| 14 | Session/user table columns relevant to account state | migrations + ORM schema |
| 15 | Cascade rules on user-owned relations (`ON DELETE`) | migrations |
| 16 | Migration file convention and naming | migrations directory |
| 17 | Background job system, if any, and how jobs are enqueued/cancelled | worker setup |
| 18 | Analytics library and event naming convention, if any | web app |
| 19 | Email sending — provider, templates, and which templates already exist | backend mailer |
| 20 | Push notification setup, if any | backend + web service worker |

### 3.1 Forgot Password

- Web: the request screen, the email it triggers, the reset screen, and the exact route
  the reset link lands on. Cite the component files.
- Backend: the reset-request route, the token it issues, **its TTL and storage**, the
  reset-confirm route, and whether it is single-use.
- Whether other sessions are revoked on reset.
- Rate limits specific to reset requests, and whether the response is
  enumeration-safe (same response for known and unknown emails).
- 📱 Mobile-only: the deep link. Custom scheme vs universal links; whether
  `apple-app-site-association` / `assetlinks.json` are already served on the web domain;
  the allowlist of redirect URLs the backend accepts.
- Password policy actually enforced server-side (not just the web form's rule).

### 3.2 Change Password

- Web: where it lives in settings, and its form.
- **Does the backend verify the current password?** Read the route; do not assume. If the
  change goes through an SDK call that skips verification, that is the headline finding.
- What happens to other sessions and to the caller's own token after a successful change.
- Whether a confirmation email is sent.
- The exact error the client gets for a wrong current password, and whether it is
  distinguishable from an expired token. If both are `401` with no `code`, that is a
  blocking backend question.

### 3.3 Delete Account

- Web: whether it exists at all; the confirmation UX; any typed-confirmation word.
- Hard delete or soft delete. If soft, the column, the purge job, and the grace period.
- **The deletion order** — every table with a user foreign key, and which lack
  `ON DELETE CASCADE`. Deleting in the wrong order fails on a constraint.
- Object storage: every bucket holding user-owned files, and who deletes them.
- Whether deletion is transactional, and what a partial failure leaves behind.
- Whether the auth-provider user record is deleted too, and by which credential.
- Whether the email may be re-registered afterwards.
- In-flight background jobs for a deleted user.

### 3.4 Deactivate Account

- Web: whether it exists; how it is worded relative to deletion.
- The state column and its migration.
- **The enforcement point.** A deactivated user's existing token usually stays
  cryptographically valid — find the middleware that must now reject it, and decide
  per-request DB lookup vs cache.
- Reactivation: implicit on next sign-in, or an explicit confirm screen.
- What the deactivated user is hidden from — search, suggestions, mentions, existing
  friend lists — and where each of those exclusions is enforced.
- Whether any notification or email fires.

### 3.5 Friends Suggestion in Feed

This is the feature most likely to already exist in Sociaity in some form. Read before
designing anything.

- **The social graph.** The friendship/follow table, its columns, whether edges are
  directed, the request/accept states, and the uniqueness constraint.
- **The feed.** Which surface is "the feed", its endpoint, its pagination, and how items
  are ordered.
- Whether a suggestions endpoint already exists. If it does, the guide documents it; if
  not, model the new one on the closest existing ranked-list route.
- The scoring signals available: mutual friends, shared groups/interests, recency,
  location. Which are actually queryable today.
- Exclusion rules: self, existing friends, pending requests in either direction, blocked
  users, dismissed suggestions, deactivated/deleted users.
- Whether dismissals are persisted server-side, and in which table.
- The friend-request routes: send, accept, reject, cancel, and their idempotency.
- 🔒 Which profile fields the suggestion payload may expose. Never the email.
- Whether accepted requests produce a notification.
- Where the section sits in the feed, and how many cards.
- 📱 Mobile: optimistic add, shared friendship state across the card and the profile
  screen, image sizing, and list virtualization.

---

## 4. Output contract

```
docs/mobile/
  README.md                        Part 1 conventions + index
  00-open-questions.md             every ⚠️ CONFIRM in one table, grouped by urgency
  01-forgot-password.md
  02-change-password.md
  03-delete-account.md
  04-deactivate-account.md
  05-friends-suggestion-in-feed.md
```

Per-feature sections, in order:

`Purpose` · `What already exists` (web + backend, cited) · `Mechanism` ·
`Configuration` (if it blocks work) · `Flow` (one labelled screen per state, `[A]`…) ·
`API contract` · `Client state` · `Edge cases` · `Security requirements` ·
`Work breakdown` (backend / mobile / design, separately) · `Acceptance checklist`

Markers, used inline:

| Marker | Meaning |
|--------|---------|
| ✅ VERIFIED | Read from the source. A `file:line` reference is mandatory. |
| ⚠️ CONFIRM | An open product or backend decision. Also goes in `00-open-questions.md`. |
| 🆕 TO BUILD | Does not exist; work required on one or both sides. |
| 📱 MOBILE-ONLY | No web counterpart — deep links, background state, store policy. |
| 🔒 SECURITY | Non-negotiable. |

**Rule that makes the guide trustworthy:** a reader must be able to tell, from the
markers alone, what they can code against today and what is still a proposal. An
uncited claim about existing behaviour is a defect.

---

## 5. What carries over from the Edge Language Coach guide

The five documents in this directory are correct for *this* repository and wrong for
Sociaity. Treat them as a **shape to reuse, not content to copy**.

| Reusable | Must be re-derived for Sociaity |
|----------|--------------------------------|
| Document structure and section order | Every endpoint, table, column, status code |
| The five markers and the citation rule | The auth mechanism and error envelope |
| `00-open-questions.md` as a blocking/soon/later triage | Every open question — Sociaity's are different |
| The screen-labelling convention (`[A]`…`[G]`) | All copy and all flows |
| The security checklists as a *prompt list* | Which of those risks actually apply |
| The deep-link section's structure | Domains, schemes, and allowlists |

Findings from the Edge guide worth re-checking in Sociaity, because they are common
failure modes rather than repo-specific quirks:

1. A password-recovery session is often a **fully valid session** — a route guard that
   only asks "is there a user?" grants full app access from a reset link.
2. Auth SDKs frequently **do not verify the current password** on a password change.
3. "Wrong password" and "expired token" both returning `401` with no error code makes a
   typo indistinguishable from a sign-out.
4. Missing `ON DELETE CASCADE` makes deletion order load-bearing and silently fragile.
5. Deactivation with no enforcement point in the auth middleware does nothing to an
   already-issued token.
