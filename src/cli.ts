import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeEvents } from "./core/analyze";
import { createIncidentReport, exportReportMarkdown } from "./core/report";
import { replayStateAt } from "./core/replay";
import { loadScenarioDirectory } from "./adapters/nodeFiles";

type OutputFormat = "json" | "markdown";

interface CliOptions {
  directory: string;
  format: OutputFormat;
  outputPath: string | null;
  replayAt: string | null;
}

function usage(): string {
  return [
    "Usage: npm run analyze -- <scenario-directory> [options]",
    "",
    "Options:",
    "  --format <json|markdown>  Export format (default: markdown)",
    "  --out <path>              Write to a file instead of stdout",
    "  --at <ISO timestamp>      Include the reconstructed resource state",
  ].join("\n");
}

export function parseCliArgs(args: string[]): CliOptions {
  const directory = args[0];
  if (!directory || directory.startsWith("--")) {
    throw new Error(usage());
  }
  let format: OutputFormat = "markdown";
  let outputPath: string | null = null;
  let replayAt: string | null = null;

  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--format" && (value === "json" || value === "markdown")) {
      format = value;
      index += 1;
    } else if (flag === "--out" && value) {
      outputPath = value;
      index += 1;
    } else if (flag === "--at" && value) {
      replayAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${flag ?? ""}\n\n${usage()}`);
    }
  }
  return { directory, format, outputPath, replayAt };
}

export async function runCli(args: string[]): Promise<string> {
  const options = parseCliArgs(args);
  const scenario = await loadScenarioDirectory(options.directory);
  const analysis = analyzeEvents(scenario.events);
  const report = createIncidentReport(analysis, scenario.manifest.title);
  const replayAt = options.replayAt ?? scenario.manifest.defaultReplayAt;
  const state = replayStateAt(analysis.events, replayAt);
  const output =
    options.format === "json"
      ? `${JSON.stringify({ report, replay: { at: replayAt, resources: state } }, null, 2)}\n`
      : `${exportReportMarkdown(report)}\n## Replayed state at ${replayAt}\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n`;

  if (options.outputPath) {
    const resolved = path.resolve(options.outputPath);
    await writeFile(resolved, output, "utf8");
    return resolved;
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2))
    .then((output) => {
      process.stdout.write(output);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
