import type { AnalysisResult, TimelineEvent } from "../core/types";

export interface AnalysisRequest {
  type: "analyze";
  requestId: number;
  events: TimelineEvent[];
  generatedAt: string;
}

export interface AnalysisSuccess {
  type: "analysis-ready";
  requestId: number;
  analysis: AnalysisResult;
}

export interface AnalysisFailure {
  type: "analysis-failed";
  requestId: number;
  message: string;
}

export type AnalysisResponse = AnalysisSuccess | AnalysisFailure;
