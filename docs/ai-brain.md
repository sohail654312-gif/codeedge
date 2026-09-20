# Codeedge knowledge brain

The web chat adapter establishes a database capability and locks the conversation.
It stores the visitor message, then calls `generateReply(db, conversationId)` in
the same transaction. The shared brain resolves the accessible conversation,
loads its tenant's current knowledge and recent messages, invokes `AiProvider`,
and validates the result. The adapter persists the assistant reply atomically.
Retries use a request UUID so a lost response cannot duplicate a turn.

The brain imports no HTTP, cookies, React or website code. Future trusted channel
adapters can establish their own appropriate database capabilities and use the
same query/provider interfaces, business data and CRM. Only web chat is enabled;
no WhatsApp, voice, telephony or human-handoff implementation is included.

## Provider status and grounding

**No live AI API is connected.** The active `DeterministicProvider` is a development
implementation: exact FAQ matching and simple question categories select facts.
It is not an LLM and does not offer general conversational reasoning. No API key,
paid call or new model dependency is required. Future vendor adapters must keep
credentials server-only and retain the response contract and tests.

`AiProvider.selectFacts` receives controlled instructions, approved facts and
bounded recent history. It returns fact keys and an enquiry suggestion, never
unchecked prose. The brain snapshots approved text before invoking the provider,
rejects unknown keys/extra fields/oversized responses and renders only that text
plus a fixed next-step message. Exceptions, malformed output, absent facts and a
three-second provider timeout produce a safe fallback. Invalid or inaccessible
conversations fail before calling a provider. Database failures roll back the turn
and return the generic chat error; they cannot partially persist a response.

This intentionally conservative contract avoids invented prices, availability,
services and promises. Business owners remain responsible for factual content in
their profile and active knowledge. Knowledge text and visitor requests are data,
not new system instructions. No booking, diagnosis, clinical advice, customer-record
retrieval or autonomous CRM mutation is implemented.

## Source of truth and bounds

Knowledge comes directly from existing profile, active services, active service
areas, configured opening hours and active FAQs, plus business name/timezone and
the locale setting. Notification emails/preferences, leads, internal notes,
memberships, credentials, session hashes and database IDs are not provider facts.
Existing RLS remains in force, with additional column-limited reads for a live
restricted chat capability. Inactive entries are excluded by both RLS and queries.

The loader takes at most 30 rows per catalogue, seven opening-hour rows, 16,000
characters of fact labels/text, and 20 recent messages bounded to 12,000 characters.
Individual facts longer than 3,500 characters are omitted rather than truncated.
Up to seven selected facts must fit the 4,000-character response limit; otherwise
the fallback is used. Bounds can therefore cause a fallback despite additional
stored knowledge. No duplicate knowledge store, embeddings or ingestion exists.

Contact capture remains explicit and optional in the chat UI. It validates name,
phone/email, requested service and summary through the existing CRM rules; the
private database function creates one `website` lead per conversation. The AI has
no independent lead store and cannot invent contact details or perform writes.

Deterministic tests cover grounded responses, provider replacement/failures/timeouts,
malicious references, current-tenant facts, bounded history, persistence and CRM
linkage. The same security tests run against native Supabase in the required CI
gate. Final native verification must be obtained externally after the single push.
