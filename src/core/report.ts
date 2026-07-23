import { redactObject, redactText } from "./redaction";
import type {
  AnalysisResult,
  EvidenceRef,
  JsonObject,
  SourceType,
  SuspicionHypothesis,
} from "./types";

export interface ReportFact {
  classification: "fact";
  eventId: string;
  at: string;
  title: string;
  summary: string;
  sourceType: SourceType;
  resourceIds: string[];
  evidence: EvidenceRef[];
  attributes: JsonObject;
}

export interface ReportUnknown {
  classification: "unknown";
  statement: string;
}

export interface IncidentReport {
  schema: "infra-rewind/report@1";
  title: string;
  generatedAt: string;
  timeline: { start: string; end: string } | null;
  facts: ReportFact[];
  inferences: SuspicionHypothesis[];
  unknowns: ReportUnknown[];
  evidenceIndex: EvidenceRef[];
  disclaimer: string;
}

function uniqueEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence
    .filter((ref) => {
      const key = `${ref.sourceName}\u0000${ref.pointer}\u0000${ref.observedAt}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        left.observedAt.localeCompare(right.observedAt) ||
        left.sourceName.localeCompare(right.sourceName) ||
        left.pointer.localeCompare(right.pointer),
    );
}

function redactHypothesis(hypothesis: SuspicionHypothesis): SuspicionHypothesis {
  return {
    ...structuredClone(hypothesis),
    rationale: hypothesis.rationale.map(redactText),
    limitations: hypothesis.limitations.map(redactText),
  };
}

export function createIncidentReport(
  analysis: AnalysisResult,
  title = "Infrastructure incident evidence report",
): IncidentReport {
  const facts: ReportFact[] = analysis.events.map((event) => ({
    classification: "fact",
    eventId: event.id,
    at: event.at,
    title: redactText(event.title),
    summary: redactText(event.summary),
    sourceType: event.sourceType,
    resourceIds: event.resourceIds.map(redactText),
    evidence: structuredClone(event.evidence),
    attributes: redactObject(event.attributes),
  }));
  const inferences = analysis.hypotheses.map(redactHypothesis);
  const evidenceIndex = uniqueEvidence([
    ...facts.flatMap((fact) => fact.evidence),
    ...inferences.flatMap((inference) => inference.evidence),
  ]);

  return {
    schema: "infra-rewind/report@1",
    title: redactText(title),
    generatedAt: analysis.generatedAt,
    timeline: analysis.bounds ? { ...analysis.bounds } : null,
    facts,
    inferences,
    unknowns: [
      {
        classification: "unknown",
        statement:
          "Imported evidence cannot establish a certain root cause; operator validation remains required.",
      },
      {
        classification: "unknown",
        statement:
          "Telemetry, dependencies, and operator actions not present in the imported files remain unknown.",
      },
    ],
    evidenceIndex,
    disclaimer:
      "Suspicion scores are explainable correlation signals. They are not determinations of causality.",
  };
}

function evidenceLabel(evidence: EvidenceRef[]): string {
  return evidence.map((ref) => `${ref.sourceName}${ref.pointer}`).join(", ");
}

export function exportReportMarkdown(report: IncidentReport): string {
  const lines = [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `> ${report.disclaimer}`,
    "",
    "## Facts",
    "",
  ];

  for (const fact of report.facts) {
    lines.push(
      `- **${fact.at} — ${fact.title}** (${fact.sourceType})`,
      `  - ${fact.summary}`,
      `  - Resources: ${fact.resourceIds.join(", ") || "none observed"}`,
      `  - Evidence: ${evidenceLabel(fact.evidence)}`,
    );
  }

  lines.push("", "## Inferences", "");
  if (report.inferences.length === 0) {
    lines.push("- No candidate change fell inside the configured evidence window.");
  } else {
    for (const inference of report.inferences) {
      lines.push(
        `- **Score ${inference.score}/100 — ${inference.candidateEventId} → ${inference.alertEventId}**`,
        ...inference.rationale.map((item) => `  - ${item}`),
        `  - Limitation: ${inference.limitations.join(" ")}`,
      );
    }
  }

  lines.push("", "## Unknowns", "");
  lines.push(...report.unknowns.map((unknown) => `- ${unknown.statement}`));
  lines.push("", "## Evidence index", "");
  lines.push(
    ...report.evidenceIndex.map(
      (ref, index) =>
        `${index + 1}. \`${ref.sourceName}${ref.pointer}\` observed at ${ref.observedAt}`,
    ),
  );
  lines.push("");
  return lines.join("\n");
}
