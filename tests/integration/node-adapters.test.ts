import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importEvidenceUrl } from "../../src/adapters/http";
import { importEvidencePaths, loadScenarioDirectory } from "../../src/adapters/nodeFiles";
import { runCli } from "../../src/cli";
import { analyzeEvents } from "../../src/core/analyze";
import { ImportError } from "../../src/core/parser";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "infra-rewind-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function manifest(evidenceFiles: string[]): string {
  return JSON.stringify({
    schema: "infra-rewind/scenario@1",
    id: "integration-fixture",
    title: "Integration fixture",
    description: "Synthetic integration fixture.",
    evidenceFiles,
    defaultReplayAt: "2026-07-18T09:00:00Z",
    expected: {
      topCandidateId: null,
      replayChecks: [
        {
          at: "2026-07-18T09:00:00Z",
          resourceId: "tf:fixture",
          path: "name",
          equals: "fixture",
        },
      ],
    },
  });
}

describe("Node filesystem adapter", () => {
  it.each([
    ["config-misconfiguration", "k8s-config-error"],
    ["capacity-shortage", "k8s-capacity-down"],
  ])("loads and analyzes the real %s scenario directory", async (scenarioId, candidateId) => {
    const loaded = await loadScenarioDirectory(path.join("examples", scenarioId));
    const analysis = analyzeEvents(loaded.events, {
      now: () => new Date("2026-07-18T12:00:00Z"),
    });

    expect(loaded.manifest.id).toBe(scenarioId);
    expect(analysis.hypotheses[0]?.candidateEventId).toBe(candidateId);
    expect(new Set(loaded.events.map((event) => event.id)).size).toBe(loaded.events.length);
  });

  it("reports missing and malformed evidence files without converting failures to success", async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, "scenario.json"), manifest(["missing.json"]), "utf8");
    await expect(loadScenarioDirectory(directory)).rejects.toMatchObject({
      code: "FILE_READ_FAILED",
    });

    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(invalidPath, "{", "utf8");
    await expect(importEvidencePaths([invalidPath])).rejects.toBeInstanceOf(ImportError);
  });

  it("rejects scenario entries that escape the manifest directory", async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, "scenario.json"), manifest(["../outside.json"]), "utf8");
    await expect(loadScenarioDirectory(directory)).rejects.toMatchObject({
      code: "UNSAFE_PATH",
    });
  });
});

describe("deterministic local HTTP adapter", () => {
  it("imports a real fixture response from an ephemeral local server", async () => {
    const payload = JSON.stringify({
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
    const server = createServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.setHeader("last-modified", "Fri, 18 Jul 2026 09:00:00 GMT");
      response.end(payload);
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Fixture server did not expose a TCP port.");
    }

    const events = await importEvidenceUrl(`http://127.0.0.1:${address.port}/terraform-plan.json`);
    expect(events[0]).toMatchObject({
      at: "2026-07-18T09:00:00.000Z",
      resourceIds: ["tf:aws_s3_bucket.fixture"],
    });
  });
});

describe("CLI export", () => {
  it.each(["json", "markdown"] as const)(
    "writes a real %s report and replay snapshot",
    async (format) => {
      const directory = await temporaryDirectory();
      const outputPath = path.join(directory, `report.${format === "json" ? "json" : "md"}`);
      const result = await runCli([
        path.join("examples", "config-misconfiguration"),
        "--format",
        format,
        "--out",
        outputPath,
        "--at",
        "2026-07-18T09:10:00Z",
      ]);
      const output = await readFile(outputPath, "utf8");

      expect(result).toBe(path.resolve(outputPath));
      expect(output).toContain(format === "json" ? '"facts"' : "## Facts");
      expect(output).toContain(format === "json" ? '"inferences"' : "## Inferences");
      expect(output).toContain(format === "json" ? '"resources"' : "## Replayed state");
    },
  );
});
