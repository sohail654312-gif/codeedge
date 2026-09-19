# Website chat

Owners enable chat from **Business workspace → Open conversations**. The resulting
`/chat/<public-widget-uuid>` URL hosts the reusable launcher. It is a hosted page;
third-party iframe/script embedding is not enabled. Existing CSP/frame protections
remain intact. No business ID, session secret, database key or private CRM record
is returned by the chat API. A public widget is deliberately discoverable, not an
authorization secret.

Each visitor receives a random 256-bit HttpOnly, SameSite=Strict cookie scoped to
that widget's API path (Secure with HTTPS). Only its SHA-256 hash is stored. Sessions
expire after 24 hours. Reloads resume the session; a different browser starts a new
one. The POST endpoint requires the configured app Origin and bounded JSON. Input
cannot select a business or conversation. Disabling the widget or suspending the
business immediately removes visitor access.

## Server connection

`CHAT_DATABASE_URL` is server-only and optional until chat is used. Without it chat
fails closed; other authenticated features continue working. On the disposable CI
runner it uses the local database URL. Every transaction switches to
`codeedge_chat_api` (NOLOGIN, NOINHERIT, NOBYPASSRLS), sets validated widget/session
context, and restores the role/context on commit/rollback. Database budgets and
conversation row locks work across app instances. Connections have short timeouts
and a pool limit of three.

For a future hosted environment, an operator must provision a dedicated LOGIN with
membership ONLY in `codeedge_chat_api`, no elevated roles, no table ownership and
no bypass privileges. Use verified TLS (`sslmode=verify-full`) and supply its secret
through the server environment. Never use the production postgres owner or a
Supabase service-role key in the web app. No hosted account is configured by this
implementation. The Data API's `anon` and `authenticated` roles cannot assume this
role or execute its private functions.

RLS and column grants isolate conversations/messages; dashboard members can read
only their active memberships' chats, without session hashes. Only owners control
widget availability. Tenant-qualified foreign keys protect message/conversation,
widget/conversation and lead/conversation relationships. Visitors have no direct
lead, note, membership or private-settings access. The narrowly scoped private
capture function derives the tenant/session and creates one existing CRM lead per
session (`website` source). Contact information is optional before asking questions.

## MVP limits and verification

There are at most 100 new conversations per business per rolling 24 hours, 30 turns
per conversation and one turn every two seconds. These are abuse/cost bounds, not
a full bot mitigation service; a public attacker could exhaust a business's daily
budget. Assess edge rate limits/CAPTCHA and a retention/deletion schedule before
public deployment. Stored conversation content persists after cookie expiry for
the business dashboard; expiry removes visitor access, not business records.

SQL tests run unchanged in PGlite locally and native PostgreSQL in CI. Browser
transport mocks test UI only; `chat-native.spec.ts` proves actual cookies, storage,
lead linkage and authenticated boundaries against disposable Supabase in CI.
Native verification is pending until that CI gate passes. No Docker is required
on the founder's laptop. This phase adds no human messaging or handoff.
