import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenarioDirectory } from "../src/adapters/nodeFiles";
import { analyzeEvents } from "../src/core/analyze";
import { createIncidentReport, exportReportMarkdown } from "../src/core/report";
import { replayStateAt } from "../src/core/replay";
import type { JsonValue } from "../src/core/types";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = path.join(root, "demo-output");
const scenarioIds = [
  "config-misconfiguration",
  "capacity-shortage",
  "unrelated-concurrent-change",
] as const;

function valueAtPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      return current[Number(segment)];
    }
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function equalJson(left: unknown, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const summaryRows: string[] = [];
for (const scenarioId of scenarioIds) {
  const scenarioDirectory = path.join(root, "examples", scenarioId);
  const scenario = await loadScenarioDirectory(scenarioDirectory);
  const analysis = analyzeEvents(scenario.events, {
    now: () => new Date(scenario.manifest.defaultReplayAt),
  });
  const topCandidate = analysis.hypotheses[0]?.candidateEventId ?? null;
  const topScore = analysis.hypotheses[0]?.score ?? 0;

  if (
    scenario.manifest.expected.topCandidateId !== null &&
    topCandidate !== scenario.manifest.expected.topCandidateId
  ) {
    throw new Error(
      `${scenarioId}: expected top candidate ${String(scenario.manifest.expected.topCandidateId)}, received ${String(topCandidate)}.`,
    );
  }
  if (
    scenario.manifest.expected.maxCandidateScore !== undefined &&
    topScore > scenario.manifest.expected.maxCandidateScore
  ) {
    throw new Error(
      `${scenarioId}: top score ${topScore} exceeded ${scenario.manifest.expected.maxCandidateScore}.`,
    );
  }

  for (const check of scenario.manifest.expected.replayChecks) {
    const snapshot = replayStateAt(analysis.events, check.at).find(
      (resource) => resource.resourceId === check.resourceId,
    );
    const actual = valueAtPath(snapshot?.state, check.path);
    if (!equalJson(actual, check.equals as JsonValue)) {
      throw new Error(
        `${scenarioId}: replay check ${check.resourceId}.${check.path} did not match the manifest.`,
      );
    }
  }

  const report = createIncidentReport(analysis, scenario.manifest.title);
  const replay = replayStateAt(analysis.events, scenario.manifest.defaultReplayAt);
  const markdown = `${exportReportMarkdown(report)}\n## Replayed state at ${scenario.manifest.defaultReplayAt}\n\n\`\`\`json\n${JSON.stringify(replay, null, 2)}\n\`\`\`\n`;
  const json = `${JSON.stringify(
    { report, replay: { at: scenario.manifest.defaultReplayAt, resources: replay } },
    null,
    2,
  )}\n`;
  await writeFile(path.join(outputDirectory, `${scenarioId}.md`), markdown, "utf8");
  await writeFile(path.join(outputDirectory, `${scenarioId}.json`), json, "utf8");

  summaryRows.push(
    `| ${scenario.manifest.title} | ${analysis.events.length} | ${analysis.hypotheses.length} | ${topScore || "none"} | [Markdown](./${scenarioId}.md) · [JSON](./${scenarioId}.json) |`,
  );
}

const summary = [
  "# Infra Rewind demo output",
  "",
  "Generated from the repository's MIT-licensed synthetic evidence. Every manifest expectation and",
  "replay assertion was checked before this index was written.",
  "",
  "| Incident | Events | Inferences | Top score | Reports |",
  "| --- | ---: | ---: | ---: | --- |",
  ...summaryRows,
  "",
].join("\n");
await writeFile(path.join(outputDirectory, "README.md"), summary, "utf8");

process.stdout.write(
  `Validated ${scenarioIds.length} incidents and wrote human-readable reports to ${outputDirectory}\n`,
);
