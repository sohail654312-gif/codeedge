# Phase 1 manual merge/release gate

**Never merge Phase 1, release it, or proceed to Phase 2 unless the required
`Foundation checks` GitHub Actions run for the current revision is green.**
The founder must inspect the evidence and record a manual approval. Passing
lightweight local checks permits preparing the first commit/push for CI; it
does not approve merge, release, or the next development phase.

## Current policy

The repository remains **PRIVATE** on its current GitHub plan. GitHub has confirmed
that branch protection is not enforced for this private repository. The founder
has chosen a manual merge/release gate; **no upgrade is required**.

GitHub may show an enabled merge button even when CI fails or has not run. Do not
use that button as approval. A missing, pending, failed, skipped, timed-out, or
cancelled run means **STOP**. If Actions is disabled, unavailable, or out of runner
quota, wait or resolve that issue; local PGlite results do not replace native CI.
This is a human-enforced policy, not a technical block on direct pushes or merges.

There is no automatic deployment, release, merge or Phase 2 trigger in this workflow.
The `.github/rulesets/phase-1.json` file is a disabled, optional future template.
Nothing imports it automatically, and CI does not depend on branch-protection APIs.

## What must pass

`.github/workflows/ci.yml` runs on pushes to `main` and `codex/**`, pull requests,
manual dispatch, and merge-group events for possible future use. The first
`codex/` feature-branch push therefore triggers CI even before a PR exists.
There are no path filters or allowed-failure steps.

| Job | Required verification |
| --- | --- |
| Application checks | Dependency install, lint, strict typecheck, all local unit/PGlite security tests, production build, anonymous browser shell checks |
| Native Supabase integration | Start disposable Supabase, apply migrations with `--local`, native pgTAP foundation tests, the existing SQL suite against native PostgreSQL, fictional fixtures, production build, real-auth browser tests |
| Phase 1 merge gate | Both jobs must report `success` and both must confirm every required step actually executed successfully |

Each verification job inspects the original outcome of every required step,
including database startup, migrations, pgTAP, SQL tests/report validation, and
browser tests. A missing/skipped step fails verification. An error hidden behind
`continue-on-error` would still fail this check. The aggregate gate runs with
`always()` and rejects failed/skipped/cancelled jobs or absent verification outputs.
GitHub can cancel a workflow entirely; a cancelled run never qualifies as green.

Native mode refuses a missing database URL instead of falling back to PGlite,
and refuses disabled authentication tests, remote database/API URLs, or placeholder
public keys. The native SQL report requires at least all existing **31** passing
policy tests with no skips/todos. The browser reporter requires all **3** auth
cases plus both **2** shell cases, with no skipped, expected-failure, or flaky cases.
The pgTAP step explicitly selects the existing foundation suite (**14 assertions**)
so an absent suite cannot become a successful empty discovery run. Add new pgTAP
suites explicitly to this required command as Phase 1 coverage expands.
Do not lower coverage minimums, disable checks, or weaken RLS to obtain green CI.

Tenant checks cover own-business access, cross-business reads and writes in both
directions, live membership revocation, anonymous denial, role escalation attempts,
profile isolation and business suspension. Browser checks add real sign-in/sign-out,
cross-tenant page/API denial, and revoked-user denial. Public signup is intentionally
disabled. Invitation/recovery email journeys, enforced MFA, production SMTP and
operational readiness are not claimed tested by this gate.

## Infrastructure and local work

The 4 GB laptop runs `npm test`, `npm run lint`, `npm run typecheck`, and
`npm run build` sequentially. **Do not install Docker or run full local Supabase
on this laptop.** The existing non-Docker test suite remains available unchanged.

Native services run in disposable containers on GitHub-hosted Ubuntu, never a
self-hosted laptop runner. No production credentials, repository secrets, hosted
Supabase project or remote database are needed. Loopback-only fixture scripts use
four fictional `@codeedge.test` users and two businesses. Administrative keys are
captured in memory, never passed to the application or persisted as status artifacts.
The application receives only a local public/anon key. Cleanup runs after failure;
the hosted VM is disposable. Never attach production secrets or deployments to CI.

## Manual procedure after an authorized push

1. Push the Phase 1 work on a `codex/` feature branch and open a PR into `main`.
   Keep unrelated files, installers, `.env.local`, and generated output out of the
   commit. This documentation does not itself authorize a commit or push.
2. In Actions, open **Foundation checks** for that exact revision. Confirm both
   verification jobs and **Phase 1 merge gate** succeeded. Inspect the native logs
   for migrations, pgTAP's 14 assertions, all 31 SQL tests and all five browser tests.
   A lone green application job, local report, old run, or unrelated workflow is
   insufficient. Inspect changed workflows, gate scripts, tests and RLS policies.
3. Compare the source commit and tested commit in the gate summary with the PR.
   PR runs may test GitHub's generated merge commit; record both it and the PR head
   SHA. Bring the branch up to date with `main` and rerun if the base changed. New
   source commits invalidate previous approval and require another green run.
4. Record the evidence below in the PR review/description before manually merging.
   Keep Phase 1 on hold until a complete run is green. No branch-protection check
   or plan upgrade is part of this approval.
5. After merging, wait for **Foundation checks** on the resulting `main` commit to
   pass. Record that SHA/run as well. Do not release or start Phase 2 until this
   post-merge check is green and the founder has recorded approval to proceed.

Required evidence (leave pending fields unapproved):

```text
Decision: HOLD / APPROVED TO MERGE / APPROVED TO PROCEED
PR or branch:
Source commit SHA:
Tested commit SHA:
Foundation checks run URL and attempt:
Application checks:
Native Supabase integration:
Phase 1 merge gate:
Native evidence: pgTAP assertion count; SQL case count; browser case count; any skips
Workflow/security changes reviewed:
Reviewer and review date:
Post-merge main SHA and green run URL (before release / Phase 2):
Outstanding pilot limitations acknowledged:
```

If any requirement is missing, leave the decision **HOLD**. Fix the failure and
rerun the same required checks. Do not mark skipped tests as passed or infer a green
run from local results. Green CI is necessary, but does not alone authorize a
deployment or prove production readiness.

## Optional future branch protection

Preserve `.github/rulesets/phase-1.json` for a later supporting plan. It currently
has `enforcement: disabled`. If protection is wanted later, import it in repository
settings and explicitly activate it: target `main`, require **Phase 1 merge gate**
from GitHub Actions, require up-to-date PRs, keep no bypass actors, and block force
pushes/deletions. Verify enforcement before claiming merges are technically blocked.
Zero required approving reviewers accommodates a solo founder. Do not remove any
stronger existing rules. These steps are optional and not required for Phase 1 now.

## Verification status

Native Supabase/pgTAP, real-auth integration and remote CI have not yet run because
the Phase 1 workflow has not been pushed. The first commit/push is for obtaining
that evidence, not a claim that these integration tests already passed.
Lightweight local results are reported separately after each verification run.

Local verification on 8 September 2026 completed successfully, without Docker:

| Command / suite | Result |
| --- | --- |
| `npm test` | 86 passed across four files |
| `tests/security/tenant-isolation.test.ts` | 31 passed using PGlite |
| `tests/unit/ci-gate.test.ts` | 42 passed, including required-step failure/skip detection |
| `tests/unit/authorization.test.ts` | 5 passed |
| `tests/unit/environment.test.ts` | 8 passed |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; all nine application routes generated |

This establishes readiness for the first authorized commit/push to obtain native CI
evidence. The manual merge/release/next-phase decision remains **HOLD** until green CI
and the founder's recorded review. No commit, push or deployment was performed.

Earlier production browser shell verification passed both tests; Windows cleanup
needed the test server stopped manually. This task reruns only the four requested
lightweight commands, and delegates browser/native integration to hosted CI.

## References

- [Supabase GitHub Actions testing](https://supabase.com/docs/guides/deployment/ci/testing)
- [GitHub step outcomes and job results](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
