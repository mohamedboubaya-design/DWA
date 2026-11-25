/* Errors the data layer raises, named after the Postgres failure they stand for. */

export type DbErrorCode =
  | "not_found"
  | "check_violation"
  | "unique_violation"
  | "foreign_key_violation"
  | "illegal_transition"
  | "insufficient_stock"
  | "expired_batch"
  | "storage_full"
  | "storage_unavailable"
  | "invalid_credentials"
  | "email_taken";

export class DbError extends Error {
  constructor(
    public code: DbErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DbError";
  }
}

/** Throws a DbError with this code when the condition is false, like a CHECK or FK constraint. */
export function check(condition: unknown, code: DbErrorCode, message?: string): asserts condition {
  if (!condition) throw new DbError(code, message);
}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
