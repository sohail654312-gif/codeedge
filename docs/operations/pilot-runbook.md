# MVP pilot operations runbook

This runbook defines the minimum operational boundary for an authorized pilot of the original Codeedge MVP. It does not authorize deployment, create paid services, or configure production accounts.

## Health and incident visibility

Use both endpoints:

- `/api/health/live`: process liveness only.
- `/api/health/ready`: dependency-aware readiness.

Server-side operational failures emit structured JSON events containing only `source`, `event`, `level`, and `timestamp`. They deliberately exclude email addresses, message bodies, database URLs, tokens, MFA material, provider response bodies, and customer data.

Alert routing is a deployment concern. Configure the hosting/log platform to alert the operator on repeated `level=error` events and sustained readiness HTTP 503 responses. Until a real alert destination is configured and tested, alert routing remains **EXTERNAL VERIFICATION REQUIRED**.

Relevant event families include readiness, authentication/invitation/recovery, Website Chat, AI fallback, and WhatsApp delivery/webhook failures.

## Supabase and database

Production must use a separate hosted Supabase project from development/CI. Preview builds and fixture scripts must never target production.

Before pilot go-live:

- confirm the production project/region and connection settings;
- confirm backups are enabled under the selected hosted plan/provider policy;
- record who owns backup monitoring and restore authorization;
- perform one provider-supported restore into a safe non-production project when the hosted project exists;
- verify the restored application-critical data and RLS/security behavior before declaring hosted restore verified.

Native CI separately performs an isolated application-data restore rehearsal. That proves Codeedge data can be copied/restored exactly in disposable PostgreSQL; it is not a substitute for the hosted provider's backup product.

## SMTP, invitation and recovery

The application keeps invitation/recovery redirects fixed to the configured application origin and `/auth/confirm`. Recovery responses remain account-enumeration safe.

Before a real pilot:

1. configure approved hosted SMTP/email delivery in Supabase using deployment secrets;
2. configure the production Site URL and exact allowed redirect URL;
3. send one owner/staff invitation to a controlled test mailbox;
4. send one recovery email to a controlled test mailbox;
5. verify both links land on the Codeedge origin and expired/invalid links fail closed;
6. verify provider delivery failure is visible in server operations without exposing recipient addresses.

Until a hosted provider and mailbox test are available, external email delivery is **EXTERNAL VERIFICATION REQUIRED**.

## WhatsApp

WhatsApp is required only if the intended pilot will use that channel. If not, leave all WhatsApp production values unset.

If required, configure server-only values in the deployment secret store, provision the trusted channel mapping through operator maintenance, verify the webhook callback/signature, send one inbound text, and confirm one outbound reply or human reply. Do not expose phone-number mappings or provider credentials to browser code.

Real provider traffic is **EXTERNAL VERIFICATION REQUIRED** until a verified provider account/number is available.

## AI provider

The current MVP uses the deterministic grounded provider and does not require a paid external AI API. A live AI vendor is therefore **NOT REQUIRED** for the original MVP pilot unless pilot scope is explicitly changed.

## Retention

No approved legal/business retention duration exists in the repository. Therefore:

- no automatic production purge is scheduled;
- no retention duration is invented by code;
- destructive tenant-wide purge is not exposed;
- retention activation requires an approved policy, restore/recovery consideration, and non-production verification.

This is an external business decision, not permission to silently delete data.

## Incident response

For a material incident:

1. identify the affected release SHA and time window;
2. inspect structured operational events and health/readiness;
3. disable or isolate the failing external channel if necessary without weakening tenant/RLS/MFA controls;
4. use the release/rollback procedure if the application release is the cause;
5. preserve audit evidence and avoid logging secrets/customer message contents;
6. record resolution and follow-up before re-enabling the affected path.
