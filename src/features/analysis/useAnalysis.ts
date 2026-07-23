import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, TimelineEvent } from "../../core/types";
import type { AnalysisRequest, AnalysisResponse } from "../../workers/protocol";

interface AnalysisState {
  signature: string;
  analysis: AnalysisResult | null;
  error: string | null;
}

export function useAnalysis(
  events: TimelineEvent[],
): Omit<AnalysisState, "signature"> & { loading: boolean } {
  const requestId = useRef(0);
  const signature = useMemo(() => JSON.stringify(events), [events]);
  const [state, setState] = useState<AnalysisState>({
    signature: "",
    analysis: null,
    error: null,
  });

  useEffect(() => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const worker = new Worker(new URL("../../workers/analysis.worker.ts", import.meta.url), {
      type: "module",
      name: "infra-rewind-analysis",
    });
    worker.addEventListener("message", (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.requestId !== currentRequest) {
        return;
      }
      if (event.data.type === "analysis-ready") {
        setState({ signature, analysis: event.data.analysis, error: null });
      } else {
        setState({ signature, analysis: null, error: event.data.message });
      }
    });
    worker.addEventListener("error", (event) => {
      setState({
        signature,
        analysis: null,
        error: event.message || "The analysis worker stopped unexpectedly.",
      });
    });

    const request: AnalysisRequest = {
      type: "analyze",
      requestId: currentRequest,
      events,
      generatedAt: new Date().toISOString(),
    };
    worker.postMessage(request);
    return () => {
      worker.terminate();
    };
  }, [events, signature]);

  return state.signature === signature
    ? { analysis: state.analysis, error: state.error, loading: false }
    : { analysis: null, error: null, loading: true };
}
