import type { JsonObject, JsonValue } from "./types";

const SENSITIVE_KEY =
  /(?:^|[_-])(password|passwd|token|secret|api[_-]?key|authorization|cookie|private[_-]?key|client[_-]?secret)(?:$|[_-])/i;

const CREDENTIAL_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi,
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql):\/\/[^@\s]+@/gi,
];

export function redactText(value: string): string {
  return CREDENTIAL_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function redactJson(value: unknown, key = ""): JsonValue {
  if (SENSITIVE_KEY.test(key)) {
    return "[REDACTED]";
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }

  if (typeof value === "object") {
    const output: JsonObject = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        output[entryKey] = redactJson(entryValue, entryKey);
      }
    }
    return output;
  }

  return String(value);
}

export function redactObject(value: unknown): JsonObject {
  const redacted = redactJson(value);
  return typeof redacted === "object" && redacted !== null && !Array.isArray(redacted)
    ? redacted
    : { value: redacted };
}
