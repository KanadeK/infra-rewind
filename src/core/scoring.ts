import { measureResourceAffinity } from "./graph";
import type { EvidenceRef, ResourceGraph, SuspicionHypothesis, TimelineEvent } from "./types";

export interface ScoringOptions {
  windowMinutes?: number;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mutationRisk(event: TimelineEvent): number {
  if (event.kind === "deployment") {
    return event.attributes.status === "failed" ? 0.9 : 0.65;
  }
  if (event.mutations.length === 0) {
    return 0.55;
  }
  return Math.max(
    ...event.mutations.map((mutation) => {
      switch (mutation.action) {
        case "delete":
          return 1;
        case "replace":
          return 0.95;
        case "update":
          return 0.85;
        case "create":
          return 0.65;
      }
    }),
  );
}

function deduplicateEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence.filter((ref) => {
    const key = `${ref.sourceName}\u0000${ref.pointer}\u0000${ref.observedAt}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function scoreSuspects(
  events: TimelineEvent[],
  graph: ResourceGraph,
  options: ScoringOptions = {},
): SuspicionHypothesis[] {
  const windowMinutes = options.windowMinutes ?? 360;
  const alerts = events.filter((event) => event.kind === "alert");
  const candidates = events.filter(
    (event) => event.kind === "change" || event.kind === "deployment",
  );
  const hypotheses: SuspicionHypothesis[] = [];

  for (const alert of alerts) {
    const alertTime = new Date(alert.at).getTime();
    for (const candidate of candidates) {
      const elapsedMinutes = (alertTime - new Date(candidate.at).getTime()) / 60_000;
      if (elapsedMinutes < 0 || elapsedMinutes > windowMinutes) {
        continue;
      }

      const temporalProximity = Math.max(0, 1 - elapsedMinutes / windowMinutes);
      const affinity = measureResourceAffinity(candidate.resourceIds, alert.resourceIds, graph);
      const risk = mutationRisk(candidate);
      let weighted = temporalProximity * 0.35 + affinity.value * 0.45 + risk * 0.2;
      if (affinity.relation === "none") {
        weighted *= 0.35;
      } else if (affinity.relation === "namespace") {
        weighted *= 0.8;
      }

      const score = Math.round(weighted * 100);
      const relationDescription =
        affinity.relation === "direct"
          ? "shares an observed resource with the alert"
          : affinity.relation === "graph"
            ? "is linked through a co-observed resource relationship"
            : affinity.relation === "namespace"
              ? "shares only a Kubernetes namespace"
              : "has no observed resource relationship";

      hypotheses.push({
        id: `hypothesis:${alert.id}:${candidate.id}`,
        rank: 0,
        classification: "inference",
        alertEventId: alert.id,
        candidateEventId: candidate.id,
        score,
        dimensions: {
          temporalProximity: round(temporalProximity),
          resourceAffinity: round(affinity.value),
          mutationRisk: round(risk),
          resourceRelation: affinity.relation,
        },
        rationale: [
          `${candidate.title} occurred ${round(elapsedMinutes, 1)} minutes before ${alert.title}.`,
          `The candidate ${relationDescription}.`,
          `The observed mutation profile contributes a ${Math.round(risk * 100)}/100 risk factor.`,
        ],
        limitations: [
          "The score measures correlation in imported evidence, not proven causality.",
          "Missing telemetry, operator actions, and dependencies can change the interpretation.",
        ],
        evidence: deduplicateEvidence([...candidate.evidence, ...alert.evidence]),
      });
    }
  }

  hypotheses.sort(
    (left, right) =>
      left.alertEventId.localeCompare(right.alertEventId) ||
      right.score - left.score ||
      left.candidateEventId.localeCompare(right.candidateEventId),
  );

  const ranks = new Map<string, number>();
  for (const hypothesis of hypotheses) {
    const rank = (ranks.get(hypothesis.alertEventId) ?? 0) + 1;
    hypothesis.rank = rank;
    ranks.set(hypothesis.alertEventId, rank);
  }
  return hypotheses;
}
