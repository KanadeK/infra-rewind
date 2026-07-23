import { describe, expect, it } from "vitest";
import { analyzeEvents } from "../../src/core/analyze";
import { createIncidentReport, exportReportMarkdown } from "../../src/core/report";
import type { TimelineEvent } from "../../src/core/types";

const events: TimelineEvent[] = [
  {
    id: "change",
    at: "2026-07-18T09:00:00.000Z",
    sourceType: "terraform_plan",
    kind: "change",
    title: "Update API environment",
    summary: "One field changed.",
    resourceIds: ["tf:aws_ecs_service.api"],
    mutations: [],
    evidence: [
      {
        sourceName: "plan.json",
        pointer: "/resource_changes/0",
        observedAt: "2026-07-18T09:00:00.000Z",
      },
    ],
    attributes: {
      authorization: "Bearer sensitive-value-that-must-not-leak",
      revision: "api:42",
    },
  },
  {
    id: "alert",
    at: "2026-07-18T09:05:00.000Z",
    sourceType: "alert_event",
    kind: "alert",
    title: "API errors",
    summary: "5xx rate crossed threshold.",
    resourceIds: ["tf:aws_ecs_service.api"],
    mutations: [],
    evidence: [
      {
        sourceName: "alerts.json",
        pointer: "/alerts/0",
        observedAt: "2026-07-18T09:05:00.000Z",
      },
    ],
    attributes: { severity: "critical" },
  },
];

describe("incident report", () => {
  it("separates facts, inferences, and unknowns with evidence references", () => {
    const analysis = analyzeEvents(events, {
      now: () => new Date("2026-07-18T10:00:00Z"),
    });
    const report = createIncidentReport(analysis, "Synthetic API incident");

    expect(report.facts).toHaveLength(2);
    expect(report.facts.every((fact) => fact.classification === "fact")).toBe(true);
    expect(report.inferences[0]).toMatchObject({
      classification: "inference",
      candidateEventId: "change",
      alertEventId: "alert",
    });
    expect(report.unknowns.length).toBeGreaterThanOrEqual(2);
    expect(report.evidenceIndex).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceName: "plan.json",
          pointer: "/resource_changes/0",
        }),
      ]),
    );
  });

  it("redacts credential-shaped values in JSON and Markdown exports", () => {
    const report = createIncidentReport(
      analyzeEvents(events, { now: () => new Date("2026-07-18T10:00:00Z") }),
      "Synthetic API incident",
    );
    const json = JSON.stringify(report);
    const markdown = exportReportMarkdown(report);

    expect(json).not.toContain("sensitive-value-that-must-not-leak");
    expect(markdown).not.toContain("sensitive-value-that-must-not-leak");
    expect(json).toContain("[REDACTED]");
    expect(markdown).toContain("Facts");
    expect(markdown).toContain("Inferences");
    expect(markdown).toContain("Unknowns");
  });

  it("exports an empty analysis without inventing facts or candidates", () => {
    const analysis = analyzeEvents([], {
      now: () => new Date("2026-07-18T10:00:00Z"),
    });
    const report = createIncidentReport(analysis, "Empty evidence set");
    const markdown = exportReportMarkdown(report);

    expect(analysis.bounds).toBeNull();
    expect(report.facts).toEqual([]);
    expect(report.inferences).toEqual([]);
    expect(markdown).toContain("No candidate change fell inside the configured evidence window.");
  });
});
