import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";
import {
  handleIdempotency,
  saveIdempotencyResponse,
} from "~/lib/idempotency.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  if (isNaN(idTask)) {
    return errorResponse("VALIDATION_ERROR", "Invalid task id.", 400);
  }

  const rawBody = await request.text();
  const endpoint = `/tasks/${idTask}/assign`;

  const idempotencyResult = await handleIdempotency(request, rawBody, endpoint);
  if (idempotencyResult instanceof Response) return idempotencyResult;
  if (idempotencyResult?.cached) return idempotencyResult.response;

  let body: { userIds?: unknown };
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }

  if (
    !Array.isArray(body.userIds) ||
    body.userIds.length === 0 ||
    !body.userIds.every((id) => typeof id === "number")
  ) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Field userIds must be a non-empty array of numbers.",
      400
    );
  }

  const userIds = body.userIds as number[];

  const task = await prisma.task.findUnique({ where: { id: idTask } });
  if (!task) {
    return errorResponse("NOT_FOUND", "Task not found.", 404);
  }

  // Validate all userIds exist atomically
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });

  if (existingUsers.length !== userIds.length) {
    const foundIds = existingUsers.map((u) => u.id);
    const missing = userIds.filter((id) => !foundIds.includes(id));
    return errorResponse(
      "NOT_FOUND",
      `Users not found: ${missing.join(", ")}`,
      404
    );
  }

  // Insert assignments — skip duplicates silently (idempotent)
  await prisma.$transaction(async (tx) => {
    for (const userId of userIds) {
      try {
        await tx.taskAssignment.create({
          data: { taskId: idTask, userId },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          // Already assigned — ignore silently
          continue;
        }
        throw err;
      }
    }
  });

  const responseBody = JSON.stringify({ message: "Users assigned successfully." });
  const status = 200;

  if (idempotencyResult && !idempotencyResult.cached) {
    await saveIdempotencyResponse(
      idempotencyResult.idempotencyId,
      status,
      responseBody
    );
  }

  return new Response(responseBody, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
