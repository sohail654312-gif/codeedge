# MVP pilot-readiness foundation — Attempt 1

Status: final-completion Attempt 1. This document records current operational boundaries; it does not declare the MVP production-ready.

## Internal operator boundary

Platform operators are separate from customer `owner` / `staff` memberships. Operator status is stored in `platform_operators`, cannot be self-granted through the application, and is intended to be provisioned only by trusted maintenance. Customer sessions cannot create or change operator records.

Operator customer-data access requires:
1. a verified Supabase user,
2. an active platform-operator record,
3. a verified TOTP factor and AAL2 session,
4. an explicit tenant/action,
5. a narrow database RPC that repeats operator/AAL2 checks.

The server-only Supabase administrative credential is used only to find or invite Auth users after the operator boundary has passed. Customer request paths never receive or use it for tenant authorization. Tenant/business membership writes are performed by narrow authenticated database functions, not by a browser-supplied role or tenant assertion.

## Membership administration

- Initial owner provisioning is an operator-only AAL2 action.
- Staff invitation/reactivation is an operator-only AAL2 action targeted at one business.
- Owners can list their own business memberships.
- Owners can revoke active staff only after owner MFA/AAL2 verification.
- Owner records cannot be removed or downgraded by either staff-management path.
- Operator self-assignment to a customer tenant is rejected.
- Revocation remains effective through live RLS checks even if an access JWT still exists.

## Administrative audit evidence

Successful business provisioning and staff membership mutations append an `admin_audit_events` record with tenant, actor, action, target, result and timestamp. Secrets, passwords, MFA material, provider credentials and message bodies are not stored in that log.

## Website Chat abuse controls

The existing request-size, session, history, per-session message and message-frequency bounds remain. Attempt 1 additionally enforces a per-widget hourly visitor-message budget before AI provider work, preserving the existing private session and restricted database-role model.

## Health and readiness

- `/api/health/live` only reports that the application process can serve a request.
- `/api/health/ready` returns only `ready` or `not_ready`.
- Readiness checks validated public configuration, Supabase Auth health, the restricted Website Chat database capability, and detects partially configured WhatsApp provider state.
- Public health responses never include credentials, database hosts, provider identifiers or internal error details.

## Authentication email boundary

Invitation and recovery URLs remain fixed to the configured application origin and `/auth/confirm`; only `invite` and `recovery` token types are accepted. Password-reset responses remain account-enumeration safe. Disposable local Supabase email is suitable for application-flow testing. Hosted SMTP/provider delivery and operational monitoring remain an Attempt 2 requirement.

## Retention and deletion

No legal/business retention duration has been chosen, so this repository does **not** invent one.

Current boundaries:
- no automatic production purge job is enabled;
- tenant-wide destructive purge is not exposed in customer or operator UI;
- important destructive customer actions remain owner-only, with MFA applied to high-impact operations already classified as privileged;
- membership revocations are auditable;
- cross-tenant deletion remains blocked by tenant-qualified relationships and RLS.

Attempt 2 must choose/approve retention durations before scheduling deletion, define restore-safe purge procedures, and verify any production retention job in a non-production environment first.

## Deliberately deferred to Attempt 2

- production backup and restore verification;
- production alert routing/observability;
- release and rollback rehearsal;
- hosted SMTP/email-provider delivery verification;
- final provider/capability verification in the intended pilot environment;
- remaining capacity/pooling, concurrency and pagination work;
- failure-path browser testing that depends on production-like external configuration;
- retention scheduling/operationalization;
- clean-room final validation and the final 100% decision.
