import { buildResourceGraph } from "./graph";
import { scoreSuspects, type ScoringOptions } from "./scoring";
import type { AnalysisResult, TimelineEvent } from "./types";

export interface AnalyzeOptions extends ScoringOptions {
  now?: () => Date;
}

export function analyzeEvents(
  events: TimelineEvent[],
  options: AnalyzeOptions = {},
): AnalysisResult {
  const ordered = structuredClone(events).sort(
    (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
  );
  const graph = buildResourceGraph(ordered);
  const hypotheses = scoreSuspects(ordered, graph, options);
  const bounds =
    ordered.length === 0
      ? null
      : {
          start: ordered[0]?.at ?? "",
          end: ordered.at(-1)?.at ?? "",
        };

  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    events: ordered,
    graph,
    hypotheses,
    bounds,
  };
}
