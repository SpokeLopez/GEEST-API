import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";
import {
  handleIdempotency,
  saveIdempotencyResponse,
} from "~/lib/idempotency.server";
import { TaskStatus } from "@prisma/client";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");

  const where =
    statusParam === "open"
      ? { status: TaskStatus.open }
      : statusParam === "archived"
      ? { status: TaskStatus.archived }
      : {};

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      assignments: {
        select: { userId: true, completed: true, completedAt: true },
      },
    },
  });

  return Response.json(tasks);
}

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const endpoint = "/tasks";

  const idempotencyResult = await handleIdempotency(request, rawBody, endpoint);
  if (idempotencyResult instanceof Response) return idempotencyResult;
  if (idempotencyResult?.cached) return idempotencyResult.response;

  let body: { title?: string; description?: string };
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }

  const { title, description } = body;

  if (!title) {
    return errorResponse("VALIDATION_ERROR", "Field title is required.", 400);
  }

  const task = await prisma.task.create({
    data: { title, description: description ?? null },
    select: { id: true, title: true, description: true, status: true },
  });

  const responseBody = JSON.stringify(task);
  const status = 201;

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
