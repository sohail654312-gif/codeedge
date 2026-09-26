# MVP final completion — Attempt 2 pilot-readiness record

Starting main: `707a23b3998ac216e2e39f3d052faea4ed9a5066`

This record distinguishes repository-verified readiness from external go-live verification. Code existing in the repository is not by itself proof that a hosted provider or production environment has been exercised.

## Repository-verified Attempt 2 closure

- safe structured operational events for dependency/provider failure paths;
- dependency-aware liveness/readiness remains non-sensitive;
- direct Website Chat and WhatsApp database pools are conservatively bounded for pilot scale;
- staff-editable CRM updates use an `updated_at` compare-and-set guard to prevent silent stale overwrites;
- growing lead, note, and quote-request reads are bounded to recent records;
- inbound WhatsApp idempotency and existing trusted channel mapping remain intact;
- native CI includes a disposable application-data backup/restore rehearsal;
- native CI includes an exact-SHA release/schema-compatible rollback rehearsal;
- no Attempt 2 database migration is permitted by the release rehearsal;
- no automatic retention purge is enabled without an approved retention policy.

## Final pilot checklist

| Requirement | Status | Evidence / remaining action |
| --- | --- | --- |
| Exact release SHA | READY | CI and release rehearsal bind validation to `GITHUB_SHA`. |
| Foundation CI | READY WHEN GREEN | Candidate, PR, and post-merge main must each be green. |
| Production environment configuration | EXTERNAL VERIFICATION REQUIRED | No production deployment is authorized in this attempt. |
| Supabase migrations / RLS | READY | Native migrations, pgTAP, security suite and authenticated browser coverage remain mandatory. |
| Hosted backup availability | EXTERNAL VERIFICATION REQUIRED | Confirm selected hosted Supabase plan/project backup capability. |
| Disposable restore rehearsal | READY | Mandatory native CI rehearsal verifies critical application tables exactly. |
| Hosted provider restore | EXTERNAL VERIFICATION REQUIRED | Rehearse provider-supported restore after hosted pilot project exists. |
| Operational logging | READY | Structured server-only events contain event labels, level and timestamp only. |
| Alert destination/routing | EXTERNAL VERIFICATION REQUIRED | Configure and test hosting/log-platform alert routing. |
| Invitation/recovery application logic | READY | Fixed-origin redirect, invalid-link denial and enumeration-safe recovery are tested. |
| Hosted SMTP delivery | EXTERNAL VERIFICATION REQUIRED | Configure provider and verify invitation + recovery in controlled mailbox. |
| WhatsApp code boundary | READY | Signature, trusted mapping, idempotency, timeout and failure behavior covered. |
| Live WhatsApp provider | EXTERNAL VERIFICATION REQUIRED if pilot uses WhatsApp | Verify real account/number/webhook/send path. |
| Live paid AI provider | NOT REQUIRED | Original MVP uses deterministic grounded provider. |
| Pooling/capacity | READY FOR PILOT SCALE | Direct channel pools bounded; growing CRM reads bounded. |
| Concurrency | READY | CRM stale updates fail closed; membership mutations already serialize/qualify state. |
| Release procedure | READY | Exact-SHA and health/readiness release procedure documented. |
| Application rollback | READY FOR ATTEMPT 2 | CI proves no Attempt 2 migration delta; rollback baseline is Attempt 1 main. |
| Retention policy duration | EXTERNAL VERIFICATION REQUIRED | Business/legal period has not been approved. No purge runs until approval. |
| Owner/operator MFA | READY | Existing AAL2 application + database enforcement remains mandatory. |
| Tenant/RLS isolation | READY | Existing application authorization and forced RLS remain mandatory CI gates. |
| Pilot smoke tests | EXTERNAL VERIFICATION REQUIRED | Run against the separately authorized hosted pilot deployment. |

## Completion interpretation

After a fully green branch, PR, merge and post-merge run, the repository-side **technical MVP** may be considered complete for the original scoped product.

Production/pilot go-live must still remain blocked until every item marked **EXTERNAL VERIFICATION REQUIRED** that applies to the selected pilot is actually verified. Do not convert an external dependency to READY merely because the application code supports it.
