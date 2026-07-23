# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffold with strict TypeScript, lint, format, test, coverage, build, and browser-test
  entry points.
- Public repository name and adjacent-project preflight.
- Deterministic parsers for Terraform plans, Kubernetes diffs, deployment/rollback events, and
  alerts.
- Resource relationship graph, explainable suspicion scoring, arbitrary-time state replay, report
  classification, and defense-in-depth sensitive-value redaction.
- Browser file, HTTP, and Node filesystem adapters plus a CLI that exports Markdown or JSON reports
  and reconstructed resource state.
- Three MIT-licensed synthetic incidents covering configuration regression, capacity shortage, and
  an unrelated concurrent change.
- Responsive incident workspace with a D3 evidence timeline, arbitrary UTC replay control,
  relationship inspection, explainable suspicion cards, local multi-file import, and real
  Markdown/JSON downloads.
- Web Worker analysis path that keeps normalization, graph construction, and scoring off the
  browser's main thread.
