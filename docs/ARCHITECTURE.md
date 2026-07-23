# Architecture

Infra Rewind separates deterministic domain logic from external adapters and rendering.

- `src/core/` owns schemas, normalization, resource relationships, scoring, replay, and exports.
- `src/adapters/` translates browser files and supported source formats into core inputs.
- `src/features/` owns application-facing use cases and UI components.
- `src/workers/` performs analysis away from the browser's main thread.
- `examples/` contains synthetic, versioned evidence bundles.

The core has no network or UI dependency. Every inference retains its supporting event and source
reference. Rendering consumes analysis results but does not alter scores or reconstructed state.

Adapters are one-way boundaries. Browser files use the file modification time only when a source
format lacks its own timestamp. The HTTP adapter rejects non-HTTP protocols and surfaces response
failures. The Node adapter constrains scenario entries to their manifest directory. All three call
the same schema validators and redaction path before analysis.

The browser sends normalized events to a module Worker. The Worker owns graph construction and
scoring, then returns an immutable analysis result. Time selection and state replay remain pure
operations in the application process, so every visible snapshot is derived from the same event
set. D3 supplies UTC scales and ticks; React renders the accessible SVG and evidence panels.
