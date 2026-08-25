export type RegistryErrorCode =
  "CONFLICT" | "IDEMPOTENCY_MISMATCH" | "NOT_FOUND" | "PROJECTION_INVARIANT";

export class RegistryApplicationError extends Error {
  readonly code: RegistryErrorCode;

  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = "RegistryApplicationError";
    this.code = code;
  }
}
