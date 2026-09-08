# Security Policy

## Supported versions

Visin is under active development. Security fixes are applied to the latest
release on `main` only.

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Instead, report it privately through
[Security → Report a vulnerability](https://github.com/visin-platform/visin/security/advisories/new).

The report stays private between you and the maintainers until a fix is
published, and it keeps the discussion attached to the repository rather than in
somebody's inbox.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept helps a lot)
- The affected service(s) — e.g. `auth-service`, `file-service`

## What to expect

- An acknowledgement within **72 hours**.
- A status update within **7 days** with an assessment and, where applicable,
  a remediation plan.
- Credit in the release notes once a fix ships, unless you prefer to remain
  anonymous.

## Scope notes

- The six backend services (`auth-service`, `file-service`, `group-service`,
  `label-service`, `mcp-service`, `vision-service`) handle authentication, signed
  file access, project-scoped API tokens, and internal service-to-service tokens —
  issues in those areas are the highest priority.
- Vulnerabilities in third-party dependencies should be reported upstream,
  but feel free to notify us as well so we can update promptly.
