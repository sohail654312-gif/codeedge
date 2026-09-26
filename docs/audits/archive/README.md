# Codeedge audit archive — GitHub preservation

Project: **Original Codeedge MVP**

The machine-readable audit source of truth is in the parent `docs/audits/` directory. This `archive/` folder preserves the shared closure record, integrity manifest, and snapshot checksums in GitHub so future Codex/agents can recover the audit history directly from the repository.

## Required reading order

1. `../AUDIT-STATUS.md`
2. `../REMEDIATION-REGISTER.md`
3. `../DELTA-AUDIT-PROTOCOL.md`
4. the relevant `../audit-*.md`
5. this archive metadata when provenance/integrity is needed

Do not restart a completed audit from scratch unless explicitly requested. Compare the recorded audited SHA with current `main` and perform delta verification only.

The human-readable PDF/DOCX archive is preserved in the central Codeedge Audit Vault. Their SHA-256 hashes are recorded here so the archive can be integrity-checked against the repository record.
