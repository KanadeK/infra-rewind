export type AdapterErrorCode =
  "FILE_READ_FAILED" | "HTTP_FAILED" | "INVALID_MANIFEST" | "UNSAFE_PATH";

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly source: string;

  constructor(code: AdapterErrorCode, source: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdapterError";
    this.code = code;
    this.source = source;
  }
}
