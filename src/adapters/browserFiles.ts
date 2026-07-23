import { parseEvidenceDocument } from "../core/parser";
import type { TimelineEvent } from "../core/types";
import { AdapterError } from "./errors";

export interface BrowserEvidenceFile {
  name: string;
  lastModified: number;
  text(): Promise<string>;
}

export async function importBrowserFiles(
  files: Iterable<BrowserEvidenceFile>,
): Promise<TimelineEvent[]> {
  const ordered = [...files].sort((left, right) => left.name.localeCompare(right.name));
  const events: TimelineEvent[] = [];

  for (const file of ordered) {
    let input: string;
    try {
      input = await file.text();
    } catch (error) {
      throw new AdapterError("FILE_READ_FAILED", file.name, `Could not read ${file.name}.`, {
        cause: error,
      });
    }

    const recordedAt =
      Number.isFinite(file.lastModified) && file.lastModified > 0
        ? new Date(file.lastModified).toISOString()
        : undefined;
    events.push(
      ...parseEvidenceDocument(input, {
        sourceName: file.name,
        ...(recordedAt ? { recordedAt } : {}),
      }),
    );
  }

  return events;
}
