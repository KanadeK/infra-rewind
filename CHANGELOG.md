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
- Unit, integration, CLI, browser-import, export, responsive-layout, keyboard, and automated
  accessibility coverage.
- Complete English and Simplified Chinese documentation, real-input/output walkthroughs, supported
  input schemas, privacy and architecture notes, and a reproducible runtime screenshot.
- A manifest-verifying demo generator and a deterministic benchmark with committed machine-readable
  results.
- Linux quality gates, Windows/macOS portability checks, dependency and repository scans, GitHub
  Pages deployment, tag-driven release automation, and deterministic cross-platform release
  archives with extraction smoke tests.

### Fixed

- Demo manifest validation now treats a null preferred candidate as a bounded-inference case
  instead of requiring the analyzer to emit no hypotheses.
- Browser verification and screenshot capture now use an ephemeral loopback port, avoiding fixed-port
  collisions without terminating an existing development server.
- Cross-platform task orchestration now invokes npm through its current CLI entry point, avoiding
  Windows `.cmd` spawn failures without enabling a shell.
- Generated demo reports now use the scenario's injected clock, keeping incident release archives
  byte-for-byte reproducible across repeated builds.
- Browser verification now caps concurrency at two workers, preventing Windows Chromium worker
  exhaustion while retaining all four independent end-to-end paths.
