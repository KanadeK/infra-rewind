# Privacy and Security

## Data flow

Infra Rewind is local-first. The production site is a static bundle with no account, analytics,
telemetry, remote storage, service worker, or upload endpoint. Imported browser files stay in the
current tab's memory. Exports are generated with `Blob` URLs and only leave the browser when the user
downloads them.

The Node CLI reads a caller-selected scenario directory. Its local adapter rejects manifest paths
that escape that directory. An HTTP adapter exists for explicit programmatic use and only accepts
`http:` or `https:`; the default UI and examples do not call it. Network requests are never inferred
from evidence content.

## Redaction

Normalization recursively redacts values beneath credential-shaped field names such as password,
token, secret, API key, authorization, cookie, and private key. It also masks credential-shaped
strings such as bearer tokens, private-key blocks, common cloud access keys, and long token-like
values. Export performs redaction again.

This is defense in depth, not a data-loss-prevention guarantee. Resource names, namespaces,
topology, hostnames, commit/revision IDs, annotations, and free-form descriptions may remain
sensitive. Unknown credential formats can also evade heuristics.

## Operator responsibilities

1. Prefer synthetic or organization-approved sanitized evidence.
2. Remove production credentials and personal data before import.
3. Review every generated Markdown or JSON report before sharing.
4. Apply your organization's retention, classification, and incident-handling policy.
5. Treat every suspicion score as a correlation signal, never proof of root cause.

## Repository and release controls

- Examples are synthetic and MIT-licensed.
- The lockfile pins the complete npm dependency graph.
- CI runs formatting, lint, strict typechecking, tests, accessibility checks, and a production
  build.
- The security workflow runs `npm audit` and the repository's secret/unfinished-marker scanner with
  read-only permissions.
- Release archives are built from a clean repository, smoke-tested after extraction, and covered by
  `SHA256SUMS.txt`.
- GitHub Pages deploys only the built application and bundled synthetic fixtures.

See [SECURITY.md](../SECURITY.md) for private vulnerability reporting.
