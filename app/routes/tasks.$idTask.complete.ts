import type { ActionFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";
import {
  handleIdempotency,
  saveIdempotencyResponse,
} from "~/lib/idempotency.server";
import { sendNotification } from "~/lib/notification.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  if (isNaN(idTask)) {
    return errorResponse("VALIDATION_ERROR", "Invalid task id.", 400);
  }

  const rawBody = await request.text();
  const endpoint = `/tasks/${idTask}/complete`;

  const idempotencyResult = await handleIdempotency(request, rawBody, endpoint);
  if (idempotencyResult instanceof Response) return idempotencyResult;
  if (idempotencyResult?.cached) return idempotencyResult.response;

  let body: { userId?: unknown };
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }

  if (typeof body.userId !== "number") {
    return errorResponse("VALIDATION_ERROR", "Field userId must be a number.", 400);
  }

  const userId = body.userId;

  // Verify task and user exist before entering the transaction
  const [task, user] = await Promise.all([
    prisma.task.findUnique({ where: { id: idTask } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!task) return errorResponse("NOT_FOUND", "Task not found.", 404);
  if (!user) return errorResponse("NOT_FOUND", "User not found.", 404);

  // Verify user is assigned
  const assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_userId: { taskId: idTask, userId } },
  });
  if (!assignment) {
    return errorResponse(
      "NOT_ASSIGNED",
      "User is not assigned to this task.",
      400
    );
  }

  let shouldNotify = false;
  let archivedTask: { title: string; archivedAt: Date | null } | null = null;

  await prisma.$transaction(async (tx) => {
    // Lock the task row to serialize concurrent completes
    await tx.$queryRaw`SELECT id FROM Task WHERE id = ${idTask} FOR UPDATE`;

    // Mark this assignment as completed
    await tx.taskAssignment.update({
      where: { taskId_userId: { taskId: idTask, userId } },
      data: { completed: true, completedAt: new Date() },
    });

    // Count remaining incomplete assignments for this task
    const pendingCount = await tx.taskAssignment.count({
      where: { taskId: idTask, completed: false },
    });

    if (pendingCount === 0) {
      // Attempt atomic archive — only the first concurrent request succeeds here
      const affectedRows = await tx.$executeRaw`
        UPDATE Task
        SET status = 'archived', archivedAt = NOW()
        WHERE id = ${idTask} AND status = 'open'
      `;

      if (affectedRows === 1) {
        shouldNotify = true;
      }
    }
  });

  if (shouldNotify) {
    // Fetch final task state outside the transaction
    const updated = await prisma.task.findUnique({ where: { id: idTask } });
    archivedTask = updated;
    if (archivedTask?.archivedAt) {
      sendNotification(idTask, archivedTask.title, archivedTask.archivedAt);
    }
  }

  const responseBody = JSON.stringify({ message: "Task marked as completed." });
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
