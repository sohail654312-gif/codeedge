# Phase 1 foundation

One Next.js application with Supabase Auth/PostgreSQL. The shell provides sign-in,
password recovery/setup, business selection, and owner-only business-name editing.
No code from other projects is reused.

Design: ink #17334a, blue #215fcc, paper #f3f6fa, white, muted #526578; system Segoe
UI type, left-aligned forms, one brand mark, visible focus, responsive layouts.

## Boundaries

1. Supabase verifies credentials. Server guards require a confirmed email.
2. Every request has a user-scoped client with a publishable/anon key.
3. Business IDs select resources. Live database membership grants authority.
4. RLS repeats the decision for reads/writes, including revocation/suspension.
5. The private SECURITY DEFINER helper avoids recursive membership policies; it
   returns only a boolean and cannot impersonate an arbitrary user.
6. Privileged operators can bypass policies by design. Their credentials must stay
   outside customer request paths and need independent operational protection.

Users relate to businesses through independent owner/staff memberships. Profiles
are private account data. No application mutation can grant membership or change
roles, status, tenant ownership, or business IDs. Local provisioning uses a separate
loopback-only script. Production onboarding/admin workflows are future work.

Future child tables must carry non-null business_id and tenant-qualified composite
foreign keys, such as (business_id, conversation_id). Those tables do not exist yet.

## Verification

| Layer | Proves | Does not prove |
| --- | --- | --- |
| Vitest authorization | Server identity/membership guards | Supabase transport |
| PGlite SQL suite | Real PostgreSQL RLS, grants, triggers, constraints | GoTrue/PostgREST/JWT transport |
| Native SQL/pgTAP | Policies with native Supabase auth schema | Browser sessions/email |
| Playwright shell | Responsive forms, anonymous route denial | Successful login |
| Playwright real auth | Login/logout, cross-tenant pages/API, revoked user | Every email/MFA/production setting |

Tests include both directions of cross-tenant reads/writes, unchanged-claims
revocation, suspension, forged metadata, denied self-provisioning/escalation, profile
isolation, and per-business roles for a user belonging to two businesses.

Native tests refuse remote database URLs and roll back fixtures. No cached database
policy decisions. Revocation affects subsequent statements under normal PostgreSQL
snapshot semantics; it cannot retract a response already delivered. Global logout
does not promise immediate invalidation of already-issued JWTs.

No browser Supabase client is used, allowing HttpOnly auth cookies. Invitation/reset
tokens are short-lived, referrers are disabled, analytics is absent, and redirects
are fixed. MFA enrollment/enforcement, SMTP, abuse-control tuning, backups, and
monitoring remain prerequisites before a real customer pilot.

## Next work

Complete the [manual merge/release gate](../phase-1-merge-gate.md) before merging,
releasing, or starting Phase 2: the current revision must have a green native CI
run and a recorded founder review. The repository stays private on its current
plan. GitHub branch protection is an optional future improvement, not a prerequisite.
Keep non-Docker tests on the 4 GB laptop; native services run only on disposable
hosted runners. Local success alone does not satisfy the manual gate.

Finish native Supabase/auth verification, then build controlled business onboarding
and audited membership/invitation management. New mutations require database policies
and negative tests before progressing to customer-facing AI or channel features.
