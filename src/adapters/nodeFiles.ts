import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseEvidenceDocument } from "../core/parser";
import type { TimelineEvent } from "../core/types";
import { AdapterError } from "./errors";
import { parseScenarioManifest, type ScenarioManifest } from "./scenario";

export interface LoadedScenario {
  directory: string;
  manifest: ScenarioManifest;
  events: TimelineEvent[];
}

export async function importEvidencePaths(paths: string[]): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  for (const inputPath of paths) {
    const resolved = path.resolve(inputPath);
    try {
      const [input, metadata] = await Promise.all([readFile(resolved, "utf8"), stat(resolved)]);
      events.push(
        ...parseEvidenceDocument(input, {
          sourceName: path.basename(resolved),
          recordedAt: metadata.mtime.toISOString(),
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ImportError") {
        throw error;
      }
      throw new AdapterError(
        "FILE_READ_FAILED",
        resolved,
        `Could not read evidence file ${resolved}.`,
        { cause: error },
      );
    }
  }
  return events;
}

function resolveInside(directory: string, entry: string): string {
  const resolvedDirectory = path.resolve(directory);
  const resolved = path.resolve(resolvedDirectory, entry);
  const relative = path.relative(resolvedDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AdapterError("UNSAFE_PATH", entry, `Scenario entry escapes its directory: ${entry}`);
  }
  return resolved;
}

export async function loadScenarioDirectory(directory: string): Promise<LoadedScenario> {
  const resolvedDirectory = path.resolve(directory);
  const manifestPath = path.join(resolvedDirectory, "scenario.json");
  let manifestInput: string;
  try {
    manifestInput = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new AdapterError(
      "FILE_READ_FAILED",
      manifestPath,
      `Could not read scenario manifest ${manifestPath}.`,
      { cause: error },
    );
  }
  const manifest = parseScenarioManifest(manifestInput, manifestPath);
  const evidencePaths = manifest.evidenceFiles.map((entry) =>
    resolveInside(resolvedDirectory, entry),
  );
  const events = await importEvidencePaths(evidencePaths);
  return { directory: resolvedDirectory, manifest, events };
}
