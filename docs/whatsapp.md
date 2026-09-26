# WhatsApp channel

Phase 7 connects WhatsApp as a trusted external channel without creating a second
CRM or a second AI brain. Inbound text messages are converted into the same
tenant-scoped conversations/messages used by website chat, and the existing
grounded AI provider and human-handoff controls are reused.

## Trust and tenant resolution

The webhook route accepts a POST only after verifying the provider HMAC signature
over the raw request body. The webhook payload cannot supply a Codeedge business
ID. Its provider phone-number ID is resolved through `whatsapp_channels`, an
operator-provisioned mapping that browser users cannot create or edit.

A dedicated server database login must have membership only in
`codeedge_whatsapp_api`. That role has no login, inheritance or RLS bypass
privileges itself; its RLS policies expose only the business selected by the
trusted phone-number mapping. Hosted database connections require verified TLS.

Owners and staff may read only safe channel status fields for their own tenant.
Provider phone-number IDs, business-account IDs, inbound event receipts and the
outbox are not browser-readable.

## Webhook and conversation flow

The webhook endpoint is `/api/webhooks/whatsapp`.

GET performs provider callback verification using the server-only
`WHATSAPP_VERIFY_TOKEN`. POST requires an HMAC-SHA256 signature using
`WHATSAPP_APP_SECRET`, enforces a bounded JSON body, accepts bounded text
messages, ignores unsupported message/status payloads, and processes at most 100
messages from one callback.

Each provider message ID is recorded once. A new external contact gets one shared
Codeedge conversation; later messages reuse it. WhatsApp conversations deliberately
have no website widget ID, browser session hash or browser expiry.

When AI handling is active, the existing tenant knowledge loader produces the same
grounded response used by website chat. The response is persisted first and an
idempotent `whatsapp_outbox` item is created. Provider delivery happens after the
database transaction. A webhook retry can safely retry an unsent outbox item
without duplicating the inbound customer message or assistant message.

When human handoff is active, inbound customer messages are still stored but no
automated reply is generated. Manual dashboard replies create the same member
message plus an outbox item for WhatsApp. Re-submitting a failed manual reply with
the same request ID retries the existing outbox item rather than creating a second
message.

## Provider adapter and secrets

`MetaWhatsAppTransport` is the production transport adapter. The API version is
configuration, not hard-coded, so deployment can use the version approved for the
connected provider application.

Required server-only production values are:

- `WHATSAPP_DATABASE_URL`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_VERSION`

No live credentials are required by CI and no real provider traffic is sent by
tests. Access tokens and app secrets must stay in the deployment secret store and
must never be saved in repository files, browser environment variables or the
Codeedge database.

## Provisioning boundary

The MVP deliberately does not let a business owner type an arbitrary provider
phone-number ID into the dashboard. After the provider account and number have
been verified externally, an operator must create the corresponding
`whatsapp_channels` row using trusted maintenance access and then enable it.

Self-service provider onboarding, token rotation UI, template-message management,
media messages and campaign/broadcast tooling are outside this milestone. Those
features should not weaken the trusted channel mapping or the existing tenant/RLS
boundary.
