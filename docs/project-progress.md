# Codeedge progress and completion sequence

## Final-completion Attempt 2 candidate — 27 September 2026

Starting main: `707a23b3998ac216e2e39f3d052faea4ed9a5066`.

Attempt 1 is merged and post-merge green. Attempt 2 is the final production/pilot
closure workstream and must not be counted as complete until its final branch,
pull-request and post-merge Foundation Checks are green.

The Attempt 2 candidate adds non-sensitive operational failure signals; conservative
Website Chat/WhatsApp direct-database pool bounds; optimistic concurrency guards for
staff-editable CRM records; bounded recent lead/note/quote views; a required
disposable application-data backup/restore rehearsal; and an exact-SHA,
schema-compatible release/rollback rehearsal. Attempt 2 introduces no database
migration.

External hosted verification is deliberately not fabricated. Production SMTP,
hosted backup/restore, alert routing, real WhatsApp traffic when used, retention
policy approval, and hosted smoke tests remain external pilot gates. The repository
can reach technical completion while production go-live remains blocked on those
applicable items. See `docs/pilot-readiness-attempt-2.md`.

## Current final-completion state — 26 September 2026

Main entered Attempt 1 at `779181e08d8f0cf359b9ffa0b0899fa025984f82`
after Phase 8B MFA enforcement and successful post-merge Foundation checks #77.
The original MVP was estimated at approximately 90–91% at that gate.

Final-completion Attempt 1 is the administration/pilot-foundation workstream. Its
candidate scope adds a separate platform-operator authorization boundary, operator
and owner AAL2-protected membership administration, administrative audit evidence,
expanded Website Chat cost/abuse controls, canonical chat-to-service CRM linkage,
dependency-aware readiness, FAQ/AI delivery consistency, precise malformed-lead
handling, and recent-activity conversation ordering.

This section is a live completion record, not permission to count unmerged work.
Only the final Attempt 1 revision that passes complete Foundation checks, is merged,
and passes post-merge main CI counts toward the completion percentage. Attempt 2
remains reserved for final production/pilot closure. See
`docs/pilot-readiness-attempt-1.md`.

## Verified completion state — 19 September 2026

- Phase 1 — COMPLETE.
- Phase 2A — COMPLETE.
- Phase 2B — COMPLETE.
- Phase 2C — COMPLETE: FAQ management and minimal business settings.
- Phase 2D — COMPLETE: Phase 2 security, integration and CI hardening.
- Phase 3 — COMPLETE: tenant-secured leads, notes and quote requests.
- Phase 4 — IMPLEMENTED on the working branch; local validation recorded below. Native CI pending.
- Phase 5 — IMPLEMENTED on the working branch; local validation recorded below. Native CI pending.
- Phase 6 — NOT STARTED.

## Phase 4 and Phase 5 local implementation — 19 September 2026

Branch: `codex/phase-4-chatbot-and-phase-5-ai-brain`, started from verified
`47f40c91c24341bc81d2884732731481b4647492`. These changes are not merged or deployed.

Phase 4 adds tenant-qualified conversations/messages, owner-controlled public
widget IDs, private cookie sessions, reusable hosted chat UI, optional CRM enquiry
capture and read-only business conversation views. The restricted server database
role has no bypass privileges; RLS, column grants and private capability functions
separate public sessions from member dashboard access. The local Phase 4 checkpoint
passed focused security/unit tests, lint, strict typecheck, production build and
one browser widget test with mocked transport. Native browser coverage is required
by the CI gate, not substituted by that mock.

Phase 5 adds a channel-independent knowledge loader, bounded history, provider
interface, deterministic development provider, grounded fact selection, safe
fallbacks and atomic response persistence. It reuses existing business knowledge
and the same CRM. No live paid AI API is connected. No Phase 6 work was started.
See [website chat](website-chat.md) and [AI brain](ai-brain.md) for setup and limits.

Final local validation passed: **581 automated tests across 22 files**, including
database/RLS, tenant isolation, chat/CRM integration and AI orchestration tests;
lint; strict typecheck; production build; and **3 production-browser tests**
(existing shell plus mocked-transport chat UI in Edge). The focused Phase 5
AI/chat run also passed 79 tests before that final full run. Native
Supabase/PostgreSQL and real authenticated chat/browser verification remain
pending the external CI review after one push. Do not merge or release unless the
required CI run for the final pushed SHA is green. No CI monitoring is performed
as part of this implementation task.

GitHub Actions [run 35454848317](https://github.com/sohail654312-gif/codeedge/actions/runs/35454848317)
passed for tested commit `3bcdc16a3975bd6ec5b6c99f405abb451eaab0e6`.
Application checks, native migrations, 14 pgTAP checks, 203 native SQL
security tests, the production build and all 11 authenticated browser checks
passed. The manual merge gate also passed. No deployment or merge occurred.

## Phase 3 local completion checkpoint — 19 September 2026

The working branch now includes the first tenant-secured lead-management CRM:
lead list and detail views, contact details, source attribution, optional service
links, status updates, internal notes and quote requests. Owners and staff can
perform day-to-day CRM writes; destructive deletes remain owner-only. All parent
and child relationships use tenant-qualified foreign keys, server actions derive
the business from live authenticated membership, and forced RLS independently
enforces the same tenant boundary.

Focused Phase 3 validation passed before the final full-suite checkpoint: 131
lead validation/action/RLS tests, followed by 119 lead/CI-hardening tests. The
native CI reporter now requires every SQL security file and every authenticated
browser file to execute and pass. The verified completion state above records the
subsequent native result. No deployment or external channel integration occurred.

## Phase 2C local completion checkpoint — 19 September 2026

Phase 2C now includes tenant-secured FAQ management and minimal business
settings. Owners can create, edit, activate and delete FAQs and update locale
and future lead-notification preferences; staff have read-only access. Tenant
ownership is derived from live authenticated membership in server actions and
enforced again through forced RLS and restricted column grants.

Focused verification passed: 142 tests across FAQ/settings validation, server
actions and SQL tenant-isolation suites; lint, strict typecheck and the
production build also passed. The verified completion state above records the
subsequent native result. No deployment occurred.

Reviewed on 13 September 2026. This is a progress record, not a release approval.

## Verified current position

- Phase 1: authentication, tenant memberships, owner/staff authorization, RLS,
  local security tests and mandatory native CI verification are implemented.
- Phase 2A: business profiles and services are implemented.
- Source and tested commit: `a3397896a29fbdf397b856c556b422f4e10bc9cb`.
- Branch: `codex/phase-1-foundation`.
- [Foundation checks, run 34238951233, attempt 1](https://github.com/sohail654312-gif/codeedge/actions/runs/34238951233)
  succeeded: Application checks, Native Supabase integration and Phase 1 merge gate.
- The application report records 155 passing tests across seven files. The final
  gate confirms all required application and native integration steps passed.
- GitHub still shows a private repository. Following the founder's explicit
  approval on 13 September 2026, main was fast-forwarded to the tested commit above.
- No customer deployment has occurred. Phase 2B development is limited to service
  areas and opening hours; its new changes require separate CI verification.

Earlier README and gate-document statements that native CI had not run are
historical. The successful run above verifies the Phase 2A source revision.
It does not substitute for post-merge verification or production readiness.

## Immediate gate

Founder decision: APPROVED TO MERGE, recorded in this task on 13 September 2026.
Integration: main fast-forwarded to `a3397896a29fbdf397b856c556b422f4e10bc9cb`.
Post-merge run: https://github.com/sohail654312-gif/codeedge/actions/runs/34740511096
Post-merge verification: PASSED on 13 September 2026. Application checks,
Native Supabase integration and Phase 1 merge gate all succeeded for the exact
source/tested commit above. The technical post-merge gate is satisfied.

The founder-approved merge and post-merge verification are complete. No security
checks were bypassed. This record does not authorize a deployment or imply that
the new Phase 2B changes have passed native CI.

## Proposed remaining milestones

These are proposed work packages, not claims of implementation or approved dates.
Use one reviewed, tested milestone at a time.

1. **Phase 2B — service areas and opening hours.** Add tenant-secured areas/towns,
   optional UK postcodes/outward codes, coverage notes, active state and display
   order. Add Monday–Sunday open/closed settings and same-day opening/closing
   times. No onboarding, invitations, membership management or scheduling.
2. **Business knowledge (future, not part of Phase 2B).** Add owner-managed FAQs and business
   policies. Start with structured text; retain tenant isolation for all knowledge.
3. **Conversations and leads.** Add tenant-scoped customers, enquiries, messages,
   conversation history and quote-request capture. Use tenant-qualified foreign keys.
4. **Website AI chatbot.** Add the embeddable widget, isolated visitor sessions,
   business-grounded answers, lead capture, rate limits and AI cost controls.
   Require tests for cross-tenant retrieval and unsafe tool/action requests.
5. **Human handoff and inbox.** Add assignment, manual replies and explicit controls
   that stop automated replies when a person takes over.
6. **WhatsApp.** Connect verified business channel accounts; authenticate webhooks,
   deduplicate messages and resolve tenant ownership from trusted channel mappings.
7. **Internal administration and pilot readiness.** Complete operator access and
   owner/operator MFA, auditability, email delivery, monitoring, retention/deletion,
   backups and restore verification, abuse controls and a small customer pilot.

Every milestone must preserve existing tests, add authorization and RLS negative
tests for its new data/actions, and pass lint, typecheck, tests, production build
and the native CI gate before progression. Native services run on disposable CI
runners, never Docker on the 4 GB laptop. Keep production credentials out of tests.
Deployments require separate authorization. Payments, advanced analytics and a full
quote builder are outside the smallest MVP described here.

## Phase 2B local verification

Branch: `codex/phase-2b-service-areas-hours`, based on the verified main commit above.
Implementation: service-area CRUD, optional postcode/outward-code normalization,
active state and order; per-day opening hours with explicit unconfigured/closed
states, same-day time validation and owner-only writes. No emergency setting or
overnight intervals. Existing authentication, tenant guards and CI gates unchanged.

- Full lint passed with zero warnings. Targeted lint also passed after a source
  folder rename and the final browser assertion adjustment.
- Strict typecheck passed after correcting an optional-prop type mismatch.
- Full suite: 268 tests passed in 10 files (155 existing plus 113 new).
- New tests: 49 SQL security/constraint cases, 34 validation cases, 30 action cases.
- Production build passed.
- Playwright discovery passed: nine cases in four files; no browser execution
  was performed locally. Two cases cover Phase 2B persistence and tenant separation.

Native Supabase/pgTAP, native SQL execution and real authenticated browser checks
remain pending an explicitly approved CI push. Phase 2B is ready for CI preparation,
not approved to merge or deploy. No commit, push, merge or deployment was performed
for Phase 2B. The unrelated installer directory remains untouched and untracked.
