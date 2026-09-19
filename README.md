# CODEEDGE

AI customer communication and lead management for UK service businesses.

**Current working branch through Phase 3 (native CI pending):** Next.js application
shell, Supabase authentication, businesses, memberships, owner/staff roles,
PostgreSQL row-level security, business profiles, services, service areas, opening
hours, FAQs, minimal business settings, and tenant-secured lead management with
notes and quote requests. AI, WhatsApp, payments, document ingestion, analytics,
and advanced channel integrations are not implemented.

## Stack

Node.js 24 LTS, npm, Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4,
minimal shadcn-compatible components, Supabase Auth/SSR, PostgreSQL, SQL migrations,
Zod, ESLint, Vitest, PGlite, pgTAP, and Playwright. Exact versions are in the lockfile.
One application; Vercel configuration selects London. Nothing is deployed.

## Local development

For the 4 GB development laptop, use Node.js 24 and npm for the non-Docker checks
below. **Do not install/run Docker Desktop or the full Supabase stack on this
machine.** Native Supabase verification runs on a disposable GitHub-hosted runner.
The Supabase CLI remains a project dependency for CI.

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Run these sequentially to limit memory use. All existing local tests are preserved.
Successful local checks do not replace native integration verification.

**Manual merge/release gate:** never merge, release, or proceed to Phase 2 unless
the `Foundation checks` GitHub Actions run for the current revision is green,
including `Application checks`, `Native Supabase integration`, and the exact
`Phase 1 merge gate` check. Record the commit SHA, run URL and your review decision.
GitHub does not block merging on the current private-repository plan; the founder
must enforce this rule manually. The repository stays private and no plan upgrade
is required. See [the manual gate procedure](docs/phase-1-merge-gate.md).

Once separately authorized, the first Phase 1 feature-branch commit/push is allowed
to trigger CI; it is not approval to merge, release, or start the next phase.

### Full disposable development stack (CI or a suitably resourced machine)

The following commands document the full-stack workflow; do not run them on the
4 GB laptop. They require Docker with a running Linux container engine.

```powershell
npm ci
npm run db:start
Copy-Item .env.example .env.local
npx supabase status
```

Edit `.env.local` with LOCAL values from the CLI:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key or legacy anon key>
```

The application rejects secret/service-role keys in this configuration. Errors name
invalid variables without revealing their contents. Remote endpoints require HTTPS.
The example file has no functional credentials.

```powershell
npm run dev:seed
npm run dev
```

Open http://localhost:3000. Studio: http://127.0.0.1:54323. Local email inbox:
http://127.0.0.1:54324. `db:start` applies migrations to a fresh stack.

To rebuild an existing disposable local database, run `npm run db:reset`, then
`npm run dev:seed`. **Reset destroys local database data.** Never use this workflow
on production.

### Fictional local accounts

All use the explicitly local password `Codeedge-local-only-123!`:

| Email | Business | Membership |
| --- | --- | --- |
| alice@codeedge.test | Northfield Plumbing | Active owner |
| bob@codeedge.test | Westbrook Electrical | Active owner |
| staff@codeedge.test | Northfield Plumbing | Active staff |
| revoked@codeedge.test | Northfield Plumbing | Revoked staff |

The seed script reads the local CLI's administrative key in memory, refuses
non-loopback endpoints, and never writes/prints keys. It creates/resets only these
fictional fixtures. Re-running resets their passwords, names, and membership states.
No administrative key is available to the web application.

## Checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` executes the **unchanged production migration** in PGlite, the PostgreSQL
engine compiled to WebAssembly. SQL requests run as unprivileged `authenticated`
and `anon` roles. Only the Supabase identity adapter is bootstrapped; actual policies,
grants, triggers, and constraints are tested, not mocked. No Docker or credentials
are required. This suite does not exercise GoTrue/PostgREST/JWT transport.

### Native Supabase database checks

On the CI runner (or a suitably resourced disposable development machine) with
Docker and local Supabase running:

```powershell
npm run db:test
$env:CODEEDGE_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm run test:security
Remove-Item Env:CODEEDGE_TEST_DATABASE_URL
```

`db:test` runs pgTAP. The second check runs the same Vitest SQL suite against native
Supabase PostgreSQL and its actual auth schema. It refuses non-local database URLs
and rolls fixtures back. Use a disposable local database with migrations applied.

### Browser checks

```powershell
npx playwright install chromium
npm run build
$env:PLAYWRIGHT_USE_BUILD = '1'
npm run test:e2e -- tests/e2e/shell.spec.ts
```

Shell checks cover responsive forms, unauthenticated redirects, and protected API
denial without requiring successful authentication. For actual local Supabase login:

```powershell
npm run dev:seed
$env:CODEEDGE_E2E_AUTH = '1'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '<local publishable or anon key>'
npm run test:e2e
```

Real authentication tests explicitly skip locally unless `CODEEDGE_E2E_AUTH=1`.
The native CI job requires them and fails on skipped/missing cases; it cannot fall
back to PGlite or placeholder configuration. Stop existing dev servers before changing environment
values; Playwright otherwise reuses that server. These tests cover both businesses,
cross-tenant routes/API requests, revoked users, sign-out, and rejection of public signup.

Set `PLAYWRIGHT_CHANNEL=chrome` to use an existing Google Chrome installation instead
of downloading Chromium. Omit `PLAYWRIGHT_USE_BUILD` to test the development server.

## Authentication and authorization

- Invitation-only accounts: public sign-up and anonymous login are disabled.
- Keep `auth.enable_signup = false` to block public registration. The separate
  `auth.email.enable_signup = true` enables the email provider, including sign-in
  for invited users; setting it to false also blocks existing users from signing in.
- Supabase verifies email/password; protected pages require verified email.
- Server-only session client with HttpOnly, SameSite=Lax cookies; Secure on HTTPS.
- Proxy refreshes tokens. Every protected page/action/API calls `auth.getUser()`.
  No authorization based on raw cookies or `getSession()` data.
- Server actions use Next.js origin protections. Redirect targets are fixed.
- Invitation and reset links use token hashes at `/auth/confirm`. Configure the
  provided `supabase/templates/` emails and exact redirect/site URLs separately
  when using hosted Supabase; local config does not configure a hosted project.
- Passwords require 12 characters. Reset responses do not reveal account existence.
- Global sign-out revokes refresh sessions. Already-issued access JWTs can remain
  valid until expiry. Membership revocation is independently checked by live RLS.
- Customer-facing provisioning, membership editing, and MFA screens are deferred.
  TOTP is enabled in local Auth config, but **application MFA is not yet enforced**.

The request's business slug/ID is a selector, never authorization. `requireTenant()`
verifies the user and active membership for that exact user/business pair. Database
policies independently check active membership and business status on each statement.
Owners may edit only their own business name; staff are read-only. UPDATE policies
recheck permission even if membership was revoked after the application's first read.

All seven application tables have RLS enabled and forced. Anonymous clients have no
table grants. Ordinary clients cannot insert/delete businesses or change memberships,
roles, statuses, IDs, or ownership. Profiles are private to their user and store no roles.

The non-exposed `private` schema contains a narrowly scoped SECURITY DEFINER boolean
membership helper with an empty search path and restricted grants. It derives the
identity from `auth.uid()` and accepts no user-ID argument. Migration/maintenance
credentials remain privileged and must never be used for customer requests.

Tenant responses are not publicly cached. CSP uses per-request script nonces and
framing is blocked for the staff shell. A future widget needs its own framing policy.

## Structure and schema

```text
src/app/                  Routes and minimal authentication/business shell
src/components/           Forms and UI primitives
src/modules/              Domain validation and authorized actions
src/server/auth/          Session guards
src/server/authorization/  Tenant/role checks
src/server/db/            Request-scoped user database client
src/server/env.ts          Environment validation
src/types/                Schema-aligned database types
supabase/migrations/      Schema, grants, policies, triggers
supabase/tests/           Native pgTAP checks
supabase/templates/       Local invitation/recovery emails
scripts/                  Local-only fictional fixtures and CI verification guards
tests/                    Unit, SQL security, browser checks
.github/workflows/        Application, native Supabase CI and aggregate merge gate
.github/rulesets/         Disabled template for optional future branch protection
```

`auth.users` owns a private `profiles` row. `business_memberships` joins users to
`businesses` with composite key `(business_id,user_id)` and non-null foreign keys.
Roles: owner/staff. Membership states: active/revoked. Business states: active/suspended.
Default timezone: Europe/London; timestamps use PostgreSQL `timestamptz`.

`npm run db:types` prints generated types. Review before replacing the currently
hand-maintained `src/types/database.ts`. Database grants remain authoritative.

## Before a real customer pilot

Tooling note: Next.js currently includes lint plugins whose peer ranges stop at
ESLint 9. This project uses ESLint 10 with the official `@eslint/compat` adapter;
all lint rules remain enabled and lint passes. npm may print peer-range warnings.
Clean-install resolution succeeds. Remove the adapter when upstream plugins support
ESLint 10 directly. Next.js also generates `AGENTS.md`/`CLAUDE.md` on first dev start.

This is a development foundation. Pass the required native Supabase CI gate,
verify invitation/reset email journeys, implement and enforce owner/operator MFA,
configure production SMTP/abuse controls, and complete backups/restoration and
monitoring. These are not claimed complete by application-only test results.

Use separate dev/staging/production projects. Select London for the production
database. Never connect preview builds or fixture scripts to production. Every future
tenant table needs explicit grants, RLS, tenant-qualified relationships, and negative
tests. No deployment, commit, or push is performed by the setup scripts.

See `docs/architecture/foundation.md` for verification boundaries and next work.

## Phase 2A: business profiles and services

The business workspace now contains a profile form and a service catalogue.
Active members can read; only owners can create, edit, or delete. Every server
mutation uses the existing verified user and live membership checks. RLS rechecks
membership at statement time, including revocations. Tenant IDs and service IDs
from forms only select records; they never grant access.

Business name uses the existing owner-only rename flow. Timezone remains the
Phase 1 UK value, Europe/London (including daylight saving). Optional profile
fields live in business_profiles. Clearing the profile deletes only those optional
details, not the tenant, name, services, users, or memberships. logo_alt is a plain
text metadata placeholder: no external image fetch or upload is performed. Website
addresses must be HTTPS without credentials and are displayed as escaped text.

Services store starting prices as integer GBP pence, or NULL for no starting price.
Zero is allowed. Amounts are limited to £1,000,000 with two decimal places; display
order is an integer from 0 to 10,000. Quote-required and active flags are independent.
Descriptions and addresses are plain text. Services sort by display order then ID.

Apply migrations in filename order to a disposable development database before
opening the workspace. No production database has been migrated by this change.
The PGlite test adapter loads all migrations; existing CI already runs all SQL
security suites against native PostgreSQL and all enabled browser suites against
Supabase. Phase 1 authentication, grants/policies, and workflow gates are unchanged.
The Phase 1 table-inventory assertion now checks all five application tables.

On a constrained Windows machine the full local suite can use:

```powershell
npm test -- --maxWorkers=1 --execArgv=--liftoff-only --execArgv=--wasm-num-compilation-tasks=1 --execArgv=--disable-wasm-trap-handler --execArgv=--max-old-space-size=256
```

These runtime options reduce compiler memory; they do not remove assertions.
Native authentication/catalog E2E requires the disposable Supabase CI environment.
Do not run Docker on the 4 GB development machine. Native verification for new
migrations runs only in the disposable GitHub Actions Supabase environment. AI,
WhatsApp, payments, document ingestion and analytics are not included.

## Phase 2B: service areas and opening hours

Phase 2B means service areas and opening hours only. It does not add onboarding,
invitations, membership management, FAQs or any later-phase features.

Apply `20260913000100_service_areas_opening_hours.sql` after the existing migrations
in the disposable CI database. `service_areas` stores a name, optional UK postcode
or outward code (such as SW1A), plain-text coverage notes, active state and display
order. Postcodes are normalized and syntax-checked, not verified with a location API.
Owners can create, edit, deactivate or delete areas; active staff can read them.

`opening_hours` has one record per business and ISO weekday (1 Monday to 7 Sunday).
Owners save each day separately. Missing records display "Not configured"; closed
records have null times. Open days require HH:MM times with closing later than
opening on the same day. Times use the existing Europe/London business timezone.
There are no overnight intervals, holiday overrides, emergency settings or bookings.

Both tables force RLS using existing live membership predicates. Only owners may
write; business IDs, record IDs, weekdays and timestamps cannot be updated by
ordinary clients. Opening-hours deletion is not granted. No Phase 1/2A policies or
CI gates are weakened or replaced. Unit/action/SQL tests cover the new behaviour;
the SQL suite also runs against native PostgreSQL in existing CI. The new browser
suite runs under the same mandatory native-auth CI configuration.

The verified Phase 2A main commit is `a3397896a29fbdf397b856c556b422f4e10bc9cb`.
Its post-merge run is https://github.com/sohail654312-gif/codeedge/actions/runs/34740511096.
Phase 2B needs its own green native CI run after an authorized push. Do not run
Docker on the 4 GB laptop; retain the constrained-memory local test command above.

## Website chat and knowledge brain

Phase 4/5 setup and limits: [Website chat](docs/website-chat.md) and
[AI brain](docs/ai-brain.md). Owners can enable a hosted chatbot from the business
conversation page. Chat uses a server-only restricted database connection and
reuses existing CRM leads. The provider is deterministic development logic;
**no live AI API is connected**. Native security and browser verification remain
required CI gates before merge/release. These additions are not a deployment.
