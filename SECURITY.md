# Security Policy

## Supported Versions

This template is pre-1.0. Security fixes are supported on `main` and the latest released tag once public releases begin.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting or open a private security advisory on the public repository. Do not disclose exploitable issues in public issues before a fix is available.

Please include:

- affected commit, tag, or deployed version;
- affected transport, route, or tool;
- reproduction steps;
- whether credentials, private content, provider ids, or logs are exposed.

## Scope

Security-sensitive areas include MCP transport behavior, authentication, content path isolation, provider integration boundaries, sync scripts, logging/redaction, and generated public examples.

The template's default API-key auth is not OAuth. Do not claim OAuth compliance unless a downstream deployment implements the requirements documented in `docs/security.md`.
