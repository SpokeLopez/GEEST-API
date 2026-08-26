type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ALREADY_ASSIGNED"
  | "NOT_ASSIGNED"
  | "TASK_ARCHIVED"
  | "IDEMPOTENCY_MISMATCH"
  | "INTERNAL_ERROR";

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number
): Response {
  return Response.json({ error: { code, message } }, { status });
}
