import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const idUser = parseInt(params.idUser ?? "", 10);
  if (isNaN(idUser)) {
    return errorResponse("VALIDATION_ERROR", "Invalid user id.", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: idUser } });
  if (!user) {
    return errorResponse("NOT_FOUND", "User not found.", 404);
  }

  const assignments = await prisma.taskAssignment.findMany({
    where: { userId: idUser },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          archivedAt: true,
        },
      },
    },
    orderBy: { task: { createdAt: "desc" } },
  });

  const result = assignments.map((a) => ({
    ...a.task,
    completed: a.completed,
    completedAt: a.completedAt,
  }));

  return Response.json(result);
}
