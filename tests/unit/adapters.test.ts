import { describe, expect, it, vi } from "vitest";
import { importBrowserFiles } from "../../src/adapters/browserFiles";
import { AdapterError } from "../../src/adapters/errors";
import { importEvidenceUrl } from "../../src/adapters/http";
import { parseScenarioManifest } from "../../src/adapters/scenario";

const terraformWithoutTimestamp = JSON.stringify({
  format_version: "1.2",
  resource_changes: [
    {
      address: "aws_s3_bucket.fixture",
      type: "aws_s3_bucket",
      name: "fixture",
      change: {
        actions: ["create"],
        before: null,
        after: { name: "fixture" },
      },
    },
  ],
});

describe("browser file adapter", () => {
  it("reads files in stable name order and supplies file modification time", async () => {
    const files = [
      {
        name: "z-plan.json",
        lastModified: Date.parse("2026-07-18T09:00:00Z"),
        text: async () => terraformWithoutTimestamp,
      },
      {
        name: "a-alerts.json",
        lastModified: 0,
        text: async () =>
          JSON.stringify({
            schema: "infra-rewind/alerts@1",
            alerts: [
              {
                id: "alert",
                timestamp: "2026-07-18T09:05:00Z",
                title: "Synthetic alert",
                status: "firing",
                severity: "warning",
                signal: "fixture",
                value: 2,
                threshold: 1,
                resources: ["tf:aws_s3_bucket.fixture"],
              },
            ],
          }),
      },
    ];

    const events = await importBrowserFiles(files);
    expect(events.map((event) => event.id)).toEqual([
      "alert",
      expect.stringMatching(/^terraform-/),
    ]);
    expect(events[1]?.at).toBe("2026-07-18T09:00:00.000Z");
  });

  it("wraps browser read failures without swallowing the cause", async () => {
    const cause = new Error("synthetic read failure");
    await expect(
      importBrowserFiles([
        {
          name: "unreadable.json",
          lastModified: 0,
          text: async () => Promise.reject(cause),
        },
      ]),
    ).rejects.toMatchObject({
      name: "AdapterError",
      code: "FILE_READ_FAILED",
      cause,
    });
  });
});

describe("HTTP adapter", () => {
  it("imports JSON and uses a valid Last-Modified timestamp", async () => {
    const fetchEvidence = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "last-modified": "Fri, 18 Jul 2026 09:00:00 GMT" }),
      text: async () => terraformWithoutTimestamp,
    }));

    const events = await importEvidenceUrl("https://fixtures.invalid/plan.json", fetchEvidence);
    expect(events[0]?.at).toBe("2026-07-18T09:00:00.000Z");
    expect(fetchEvidence).toHaveBeenCalledWith(
      new URL("https://fixtures.invalid/plan.json"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects unsafe protocols, HTTP errors, and network failures", async () => {
    await expect(importEvidenceUrl("file:///private/plan.json")).rejects.toBeInstanceOf(
      AdapterError,
    );
    await expect(
      importEvidenceUrl("https://fixtures.invalid/missing.json", async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        text: async () => "",
      })),
    ).rejects.toMatchObject({ code: "HTTP_FAILED" });
    await expect(
      importEvidenceUrl("https://fixtures.invalid/failure.json", async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toMatchObject({ code: "HTTP_FAILED" });
  });
});

describe("scenario manifest", () => {
  it("reports malformed JSON and schema failures as adapter errors", () => {
    expect(() => parseScenarioManifest("{", "scenario.json")).toThrowError(AdapterError);
    expect(() => parseScenarioManifest('{"schema":"wrong"}', "scenario.json")).toThrowError(
      expect.objectContaining({ code: "INVALID_MANIFEST" }),
    );
  });
});
