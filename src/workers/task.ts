import { analyzeEvents } from "../core/analyze";
import type { AnalysisRequest, AnalysisResponse } from "./protocol";

export function processAnalysisRequest(request: AnalysisRequest): AnalysisResponse {
  try {
    return {
      type: "analysis-ready",
      requestId: request.requestId,
      analysis: analyzeEvents(request.events, {
        now: () => new Date(request.generatedAt),
      }),
    };
  } catch (error) {
    return {
      type: "analysis-failed",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Analysis failed for an unknown reason.",
    };
  }
}
