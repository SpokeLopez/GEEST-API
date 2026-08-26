import { createHash } from "node:crypto";
import { prisma } from "~/lib/db.server";
import { Prisma } from "@prisma/client";

const POLL_INTERVAL_MS = 75;
const POLL_TIMEOUT_MS = 5_000;

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Handles idempotency for POST endpoints.
 *
 * Returns:
 * - { cached: true, response } → replay stored response immediately
 * - { cached: false, key, endpoint, requestHash } → proceed and call saveIdempotencyResponse when done
 * - null → no Idempotency-Key header present, proceed normally
 */
export async function handleIdempotency(
  request: Request,
  rawBody: string,
  endpoint: string
): Promise<
  | { cached: true; response: Response }
  | { cached: false; idempotencyId: number; requestHash: string }
  | null
  | Response
> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return null;

  const requestHash = hashBody(rawBody);

  try {
    const record = await prisma.idempotencyKey.create({
      data: {
        key,
        endpoint,
        requestHash,
        responseBody: "",
        responseStatus: 0,
      },
    });
    return { cached: false, idempotencyId: record.id, requestHash };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Duplicate key — check existing record
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key_endpoint: { key, endpoint } },
      });

      if (!existing) {
        // Race condition: record disappeared; treat as new
        return null;
      }

      if (existing.requestHash !== requestHash) {
        return Response.json(
          {
            error: {
              code: "IDEMPOTENCY_MISMATCH",
              message:
                "Idempotency-Key reused with a different request body.",
            },
          },
          { status: 422 }
        );
      }

      // Same key + same body: poll until the first request finishes
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const record = await prisma.idempotencyKey.findUnique({
          where: { key_endpoint: { key, endpoint } },
        });
        if (record && record.responseStatus > 0) {
          return {
            cached: true,
            response: new Response(record.responseBody, {
              status: record.responseStatus,
              headers: { "Content-Type": "application/json" },
            }),
          };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Timeout — the original request likely failed without saving; proceed fresh
      return null;
    }
    throw err;
  }
}

export async function saveIdempotencyResponse(
  idempotencyId: number,
  status: number,
  body: string
): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { id: idempotencyId },
    data: { responseBody: body, responseStatus: status },
  });
}
