import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  if (isNaN(idTask)) {
    return errorResponse("VALIDATION_ERROR", "Invalid task id.", 400);
  }

  const task = await prisma.task.findUnique({
    where: { id: idTask },
    include: {
      assignments: {
        include: {
          user: { select: { id: true, name: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!task) {
    return errorResponse("NOT_FOUND", "Task not found.", 404);
  }

  const result = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt,
    archivedAt: task.archivedAt,
    assignments: task.assignments.map((a) => ({
      userId: a.userId,
      user: a.user,
      completed: a.completed,
      completedAt: a.completedAt,
    })),
  };

  return Response.json(result);
}
