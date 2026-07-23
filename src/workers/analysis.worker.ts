import type { AnalysisRequest, AnalysisResponse } from "./protocol";
import { processAnalysisRequest } from "./task";

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<AnalysisRequest>) => void): void;
  postMessage(message: AnalysisResponse): void;
}

const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  workerScope.postMessage(processAnalysisRequest(event.data));
});
