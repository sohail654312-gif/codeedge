# Attempt 2 release and rollback

This procedure closes the application-side release boundary for the original Codeedge MVP. It does not authorize or perform a production deployment.

## Release identity

Every candidate and deployed release must be tied to an exact Git SHA. The release operator records:

- source SHA;
- Foundation Checks run and result;
- deployment environment;
- health/readiness result after deployment;
- whether the release contains database migrations;
- previous known-good application SHA.

Attempt 2 starts from the known-good Attempt 1 main SHA:

`707a23b3998ac216e2e39f3d052faea4ed9a5066`

Attempt 2 intentionally introduces no database migration. Native CI verifies that the candidate is a descendant of this SHA and that `supabase/migrations/` has no Attempt 2 delta.

## Release procedure

1. Require a complete green Foundation Checks run for the exact candidate SHA.
2. Confirm the branch is synchronized with `main` and review the complete diff.
3. Confirm no production secret, credential, fixture, or provider token is in source.
4. Apply migrations only if the candidate contains reviewed migrations. Attempt 2 currently contains none.
5. Deploy the exact approved SHA only after separate production-deployment authorization.
6. Verify `/api/health/live` returns HTTP 200 and `{"status":"alive"}`.
7. Verify `/api/health/ready` returns HTTP 200 and `{"status":"ready"}`.
8. Smoke-test sign-in, one authorized tenant page, and one denied cross-tenant path.
9. Record the deployed SHA and the completed checklist in the release record.

A liveness success is not enough. Readiness must also succeed because it verifies public configuration, Supabase Auth reachability, the restricted Website Chat database capability, and coherent WhatsApp configuration.

## Rollback procedure

For the Attempt 2 candidate, application rollback to `707a23b3998ac216e2e39f3d052faea4ed9a5066` is schema-compatible because CI rejects any Attempt 2 migration delta.

Emergency rollback:

1. Stop further rollout.
2. Identify the exact deployed SHA and previous known-good SHA.
3. Check whether any database migrations were applied after the previous known-good SHA.
4. If there is no incompatible schema change, redeploy the previous known-good application SHA.
5. Re-check liveness, readiness, authentication, tenant isolation, and the affected customer path.
6. Record the incident and rollback evidence.

If a future release includes a migration, do not assume application rollback is safe. Prefer forward repair where possible. Any destructive or incompatible database rollback requires an approved recovery plan and a verified backup/restore point; never run an ad-hoc destructive rollback against production.

## CI rehearsal

Native CI runs `scripts/ci/release-candidate-rehearsal.mjs` after the production build and browser suite. It verifies the exact Git SHA, ancestry from the Attempt 1 baseline, absence of Attempt 2 migration changes, a clean tracked working tree, a valid production build, migration filename integrity, and presence of the operational runbooks.

This rehearsal proves the repository-side release/rollback boundary. It does not prove a hosted deployment has been rolled back in production.
