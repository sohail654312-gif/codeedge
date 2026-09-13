# Codeedge progress and completion sequence

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
