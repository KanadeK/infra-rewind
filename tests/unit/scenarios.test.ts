import { describe, expect, it } from "vitest";
import { analyzeEvents } from "../../src/core/analyze";
import { replayStateAt } from "../../src/core/replay";
import { BUILT_IN_SCENARIO_SUMMARIES, getBuiltInScenario } from "../../src/demo/scenarios";
import type { JsonValue } from "../../src/core/types";

function valueAtPath(value: JsonValue, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      return current[Number(segment)];
    }
    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

describe("built-in synthetic incidents", () => {
  it("ships exactly the three contracted scenarios", () => {
    expect(BUILT_IN_SCENARIO_SUMMARIES.map((scenario) => scenario.id)).toEqual([
      "config-misconfiguration",
      "capacity-shortage",
      "unrelated-concurrent-change",
    ]);
  });

  it.each(["config-misconfiguration", "capacity-shortage"])(
    "identifies the expected top candidate in %s",
    (scenarioId) => {
      const scenario = getBuiltInScenario(scenarioId);
      const analysis = analyzeEvents(scenario.events, {
        now: () => new Date("2026-07-18T12:00:00Z"),
      });
      expect(analysis.hypotheses[0]?.candidateEventId).toBe(
        scenario.manifest.expected.topCandidateId,
      );
      expect(analysis.events.some((event) => event.kind === "rollback")).toBe(true);
    },
  );

  it("keeps unrelated concurrent changes below the fixture suspicion ceiling", () => {
    const scenario = getBuiltInScenario("unrelated-concurrent-change");
    const analysis = analyzeEvents(scenario.events, {
      now: () => new Date("2026-07-18T12:00:00Z"),
    });
    const maximum = Math.max(...analysis.hypotheses.map((hypothesis) => hypothesis.score));
    expect(maximum).toBeLessThanOrEqual(scenario.manifest.expected.maxCandidateScore ?? 0);
    expect(analysis.hypotheses.every((item) => item.classification === "inference")).toBe(true);
  });

  it.each(BUILT_IN_SCENARIO_SUMMARIES.map((scenario) => scenario.id))(
    "matches every declared replay check for %s",
    (scenarioId) => {
      const scenario = getBuiltInScenario(scenarioId);
      for (const check of scenario.manifest.expected.replayChecks) {
        const snapshot = replayStateAt(scenario.events, check.at).find(
          (resource) => resource.resourceId === check.resourceId,
        );
        expect(snapshot, `${scenarioId} ${check.at} ${check.resourceId}`).toBeDefined();
        expect(valueAtPath(snapshot!.state, check.path)).toEqual(check.equals);
      }
    },
  );

  it("returns isolated copies and rejects an unknown scenario", () => {
    const first = getBuiltInScenario("config-misconfiguration");
    first.events[0]!.title = "mutated in test";
    expect(getBuiltInScenario("config-misconfiguration").events[0]?.title).not.toBe(
      "mutated in test",
    );
    expect(() => getBuiltInScenario("unknown")).toThrowError(RangeError);
  });
});
