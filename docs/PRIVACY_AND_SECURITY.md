# Privacy and Security

Infra Rewind is local-first. The static application does not require an account, analytics, remote
storage, or third-party APIs. Imported files stay in browser memory unless the user explicitly
downloads an export.

Known-sensitive field names and credential-shaped strings are redacted during normalization and
again during export. Redaction is a safety net, not a guarantee: resource names, topology, commit
identifiers, and free-form messages may still be confidential.

Operators should use sanitized evidence, review generated reports, and apply their organization's
data-handling policy before sharing. A suspicion score is an explainable correlation signal, never
proof of root cause.
