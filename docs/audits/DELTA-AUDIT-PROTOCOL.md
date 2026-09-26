# Codeedge MVP — Delta-Audit Protocol

1. Read `AUDIT-STATUS.md` and `REMEDIATION-REGISTER.md`.
2. Record audited implementation SHA and current `main` SHA.
3. Compare audited SHA -> current main.
4. Classify changed files by domain: auth/tenant, database/migrations, business data, CRM, Website Chat, AI Brain, CI/deployment/docs.
5. Map changed domains to existing findings.
6. Re-verify only affected findings and cross-cutting boundaries. Preserve unaffected conclusions.
7. Preserve historical findings exactly; append verification evidence rather than rewriting history.
8. Move a finding to VERIFIED only with explicit evidence, commit SHA, tests/CI where relevant, and production/config proof where operational.
9. A code change that appears related is not enough to close a finding.
10. Keep audit completion separate from product-development completion and production readiness.

When asked “check the audit”, use this delta procedure instead of restarting the full four-audit programme.
