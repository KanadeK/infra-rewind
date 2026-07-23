# Reproducible Demo

The demo generator reads all committed synthetic evidence through the same filesystem adapter and
domain core used by the CLI:

```bash
npm ci
npm run demo
```

Before writing output, it verifies each manifest's preferred candidate or score ceiling and every
arbitrary-time replay assertion. It then creates:

```text
demo-output/
├── README.md
├── config-misconfiguration.md
├── config-misconfiguration.json
├── capacity-shortage.md
├── capacity-shortage.json
├── unrelated-concurrent-change.md
└── unrelated-concurrent-change.json
```

Open `demo-output/README.md` to inspect the generated index. The directory is ignored because each
file is reproducible from versioned evidence.

## Web demo

```bash
npm run dev
```

The UI starts with the configuration regression. Use the scenario buttons to inspect capacity and
unrelated-change boundaries. Timeline markers, the slider, UTC input, and previous/next controls all
set the same replay time. The two export buttons generate actual files from the current analysis.

## Runtime screenshot

The README screenshot is not a mock-up. Regenerate it from a production build with:

```bash
npm run demo:screenshot
```

The script builds the current source, starts an in-process Vite preview on loopback, waits for the
Worker-backed analysis to become ready, captures Chromium at 1440×1100, and writes
`docs/assets/infra-rewind-dashboard.png`.
