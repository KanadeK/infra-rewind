import { describe, expect, it } from "vitest";
import { getBuiltInScenario } from "../../src/demo/scenarios";
import { processAnalysisRequest } from "../../src/workers/task";

describe("analysis worker task", () => {
  it("returns deterministic analysis for a serializable worker request", () => {
    const scenario = getBuiltInScenario("capacity-shortage");
    const response = processAnalysisRequest({
      type: "analyze",
      requestId: 17,
      events: scenario.events,
      generatedAt: "2026-07-18T12:00:00.000Z",
    });

    expect(response.type).toBe("analysis-ready");
    expect(response.requestId).toBe(17);
    if (response.type !== "analysis-ready") {
      throw new Error(response.message);
    }
    expect(response.analysis.generatedAt).toBe("2026-07-18T12:00:00.000Z");
    expect(response.analysis.hypotheses[0]?.candidateEventId).toBe("k8s-capacity-down");
    expect(response.analysis.hypotheses).toHaveLength(3);
  });

  it("returns a bounded failure message instead of throwing across the worker boundary", () => {
    const response = processAnalysisRequest({
      type: "analyze",
      requestId: 18,
      events: [null] as never,
      generatedAt: "2026-07-18T12:00:00.000Z",
    });

    expect(response).toMatchObject({
      type: "analysis-failed",
      requestId: 18,
      message: expect.any(String),
    });
  });
});
