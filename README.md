# Infra Rewind

Infra Rewind is an offline-first infrastructure incident replay tool. It aligns IaC changes,
deployments, alerts, and rollbacks on one timeline while treating causality as a hypothesis that
must remain backed by evidence.

The v0.1.0 implementation is being assembled in auditable milestones. The domain core, adapters,
interactive interface, deterministic examples, verification commands, and release artifacts are
all part of this repository's delivery contract.

Public repository sampling on 2026-07-23 did not find an active project with both the same name and
a highly isomorphic scope. See [the competitor scan](docs/COMPETITOR_SCAN.md) for the query record,
ten reviewed repositories, and the concrete differentiation.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Infra Rewind runs on synthetic, MIT-licensed fixtures by default. It does not upload imported
infrastructure data and must never be treated as an automated root-cause authority.

## License

[MIT](LICENSE) © 2026 KanadeK.
