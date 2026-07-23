import { describe, expect, it } from "vitest";
import { PROJECT_META } from "../../src/project";

describe("project identity", () => {
  it("keeps the public name, slug, and semantic version aligned", () => {
    expect(PROJECT_META).toMatchObject({
      name: "Infra Rewind",
      slug: "infra-rewind",
      version: "0.1.0",
    });
    expect(PROJECT_META.statement).toContain("without presenting correlation as proven causality");
  });
});
