import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadScenarioDirectory } from "../src/adapters/nodeFiles";
import { analyzeEvents } from "../src/core/analyze";
import type { TimelineEvent } from "../src/core/types";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function shiftTimestamp(timestamp: string, days: number): string {
  return new Date(new Date(timestamp).getTime() + days * 86_400_000).toISOString();
}

function expand(events: TimelineEvent[], copies: number): TimelineEvent[] {
  return Array.from({ length: copies }, (_, copy) =>
    events.map((event) => {
      const shifted = structuredClone(event);
      shifted.id = `${event.id}:copy-${copy}`;
      shifted.at = shiftTimestamp(event.at, copy);
      shifted.evidence = shifted.evidence.map((reference) => ({
        ...reference,
        observedAt: shiftTimestamp(reference.observedAt, copy),
      }));
      shifted.mutations = shifted.mutations.map((mutation) => ({
        ...mutation,
        evidence: {
          ...mutation.evidence,
          observedAt: shiftTimestamp(mutation.evidence.observedAt, copy),
        },
      }));
      return shifted;
    }),
  ).flat();
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index] ?? 0;
}

function measure(name: string, events: TimelineEvent[], iterations: number, warmups: number) {
  for (let index = 0; index < warmups; index += 1) {
    analyzeEvents(events);
  }

  const samples: number[] = [];
  let result = analyzeEvents(events);
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    result = analyzeEvents(events);
    samples.push(performance.now() - started);
  }

  return {
    name,
    eventCount: events.length,
    resourceCount: result.graph.nodes.length,
    hypothesisCount: result.hypotheses.length,
    iterations,
    medianMs: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
  };
}

const scenario = await loadScenarioDirectory(
  path.join(root, "examples", "config-misconfiguration"),
);
const benchmark = {
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? "unknown",
    logicalCores: os.cpus().length,
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
  },
  cases: [
    measure("bundled incident", scenario.events, 2_000, 100),
    measure("50 incident copies", expand(scenario.events, 50), 50, 10),
  ],
};

const serialized = `${JSON.stringify(benchmark, null, 2)}\n`;
process.stdout.write(serialized);
if (process.argv.includes("--write")) {
  const outputPath = path.join(root, "docs", "benchmark-results.json");
  await writeFile(outputPath, serialized, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
}
