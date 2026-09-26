# Retention activation boundary

The original MVP has no approved legal/business retention duration. Codeedge therefore keeps retention inactive by default.

A future production retention activation requires all of the following before any scheduled deletion is enabled:

1. an approved, written retention period for each affected data class;
2. named operational ownership;
3. confirmation that the period is compatible with backup/restore obligations;
4. tenant-qualified deletion logic with explicit bounds;
5. negative cross-tenant tests and non-production execution evidence;
6. a recovery/incident procedure;
7. a separately reviewed production scheduling change.

Until those requirements exist, retention status is **EXTERNAL VERIFICATION REQUIRED / POLICY DECISION REQUIRED** and no automatic purge job should exist.

Revoked memberships, administrative audit evidence, customer CRM records, conversations/messages and channel records must not be deleted merely to make the repository appear production-ready.
