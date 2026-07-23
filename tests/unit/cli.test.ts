import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli";

describe("CLI arguments", () => {
  it("parses format, output, and replay options", () => {
    expect(
      parseCliArgs([
        "examples/capacity-shortage",
        "--format",
        "json",
        "--out",
        "report.json",
        "--at",
        "2026-07-18T10:12:00Z",
      ]),
    ).toEqual({
      directory: "examples/capacity-shortage",
      format: "json",
      outputPath: "report.json",
      replayAt: "2026-07-18T10:12:00Z",
    });
  });

  it("rejects missing directories and unknown or incomplete options", () => {
    expect(() => parseCliArgs([])).toThrowError(/Usage:/);
    expect(() => parseCliArgs(["examples/capacity-shortage", "--format", "xml"])).toThrowError(
      /Unknown or incomplete option/,
    );
  });
});
