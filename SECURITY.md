# Security policy

ControlLayer stores audit evidence and holds read access to cloud accounts, so we take vulnerabilities seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub's "Report a vulnerability" button on the repository's **Security** tab (private vulnerability reporting).

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within 3 business days and to share a fix timeline after triage.

## Supported versions

Security fixes are made on the latest release on `main`.

## Hardening checklist for operators

- Serve ControlLayer over HTTPS behind a reverse proxy.
- Use a strong `POSTGRES_PASSWORD` and don't expose the database port publicly.
- Give the scanner identities read-only roles only (`SecurityAudit`, `Viewer` + `Security Reviewer`, `Reader` + `Security Reader`).
- Leave `ENABLE_AWS_REMEDIATION` off unless you need it.
- Back up the database; it contains all uploaded evidence.
- Record the evidence chain head from each audit package export.
