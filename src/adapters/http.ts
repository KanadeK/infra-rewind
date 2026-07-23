import { parseEvidenceDocument } from "../core/parser";
import type { TimelineEvent } from "../core/types";
import { AdapterError } from "./errors";

export type FetchEvidence = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "headers" | "text">>;

function validatedUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new AdapterError("HTTP_FAILED", input, `Invalid evidence URL: ${input}`, {
      cause: error,
    });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AdapterError("HTTP_FAILED", input, "Evidence URL must use http or https.");
  }
  return url;
}

export async function importEvidenceUrl(
  input: string,
  fetchEvidence: FetchEvidence = fetch,
): Promise<TimelineEvent[]> {
  const url = validatedUrl(input);
  let response: Awaited<ReturnType<FetchEvidence>>;
  try {
    response = await fetchEvidence(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    throw new AdapterError(
      "HTTP_FAILED",
      url.toString(),
      `Network request failed for ${url.toString()}.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new AdapterError(
      "HTTP_FAILED",
      url.toString(),
      `Evidence request returned ${response.status} ${response.statusText}.`,
    );
  }

  const modified = response.headers.get("last-modified");
  const recordedAt =
    modified && !Number.isNaN(Date.parse(modified)) ? new Date(modified).toISOString() : undefined;
  return parseEvidenceDocument(await response.text(), {
    sourceName: url.toString(),
    ...(recordedAt ? { recordedAt } : {}),
  });
}
