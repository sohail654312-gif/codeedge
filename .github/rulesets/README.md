# Optional future branch protection

`phase-1.json` is a **disabled template**, not an active GitHub rule. The current
private repository uses the [manual merge/release gate](../../docs/phase-1-merge-gate.md).
No plan upgrade or branch-protection activation is required for that process.

If a supporting plan is adopted later, import this template into repository
settings, confirm the `main` target and `Phase 1 merge gate` check from GitHub
Actions, then explicitly change enforcement to Active. Retain the empty bypass
list and up-to-date requirement. Verify enforcement on a pull request before
claiming GitHub blocks merges. Keep the repository private.

No workflow imports or activates this template automatically.
