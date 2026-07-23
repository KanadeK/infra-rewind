import { describe, expect, it } from "vitest";
import { redactJson, redactObject, redactText } from "../../src/core/redaction";

describe("redaction", () => {
  it("handles primitives, arrays, undefined fields, and non-finite numbers", () => {
    expect(redactJson(null)).toBeNull();
    expect(redactJson(true)).toBe(true);
    expect(redactJson(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(redactJson(["safe", 2])).toEqual(["safe", 2]);
    expect(redactJson({ kept: "yes", omitted: undefined })).toEqual({ kept: "yes" });
    expect(redactObject("scalar")).toEqual({ value: "scalar" });
  });

  it("redacts sensitive keys and credential-shaped substrings", () => {
    const bearer = ["Bearer", "header.payload.signature-value"].join(" ");
    const accessKey = ["AKIA", "1234567890ABCDEF"].join("");
    const database = "postgresql://operator:private-pass@database.example/infra";

    expect(redactJson({ client_secret: "plain-value", nested: { password: "private" } })).toEqual({
      client_secret: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
    expect(redactText(`Auth ${bearer}; key ${accessKey}`)).toBe("Auth [REDACTED]; key [REDACTED]");
    expect(redactText(database)).toBe("[REDACTED]database.example/infra");
  });
});
