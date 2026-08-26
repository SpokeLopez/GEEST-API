import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  if (isNaN(idTask)) {
    return errorResponse("VALIDATION_ERROR", "Invalid task id.", 400);
  }

  const task = await prisma.task.findUnique({ where: { id: idTask } });
  if (!task) {
    return errorResponse("NOT_FOUND", "Task not found.", 404);
  }

  const attempts = await prisma.notificationAttempt.findMany({
    where: { taskId: idTask },
    orderBy: { attemptNumber: "asc" },
    select: {
      id: true,
      attemptNumber: true,
      timestamp: true,
      httpStatus: true,
      succeeded: true,
    },
  });

  return Response.json(attempts);
}
