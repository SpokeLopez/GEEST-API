import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";
import {
  handleIdempotency,
  saveIdempotencyResponse,
} from "~/lib/idempotency.server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function loader(_: LoaderFunctionArgs) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assignments: {
        where: {
          completed: false,
          task: { status: "open" },
        },
        include: { task: { select: { id: true, title: true, status: true } } },
      },
    },
  });

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    lastName: u.lastName,
    email: u.email,
    createdAt: u.createdAt,
    pendingTasks: u.assignments.map((a) => a.task),
  }));

  return Response.json(result);
}

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const endpoint = "/users";

  const idempotencyResult = await handleIdempotency(request, rawBody, endpoint);
  if (idempotencyResult instanceof Response) return idempotencyResult;
  if (idempotencyResult?.cached) return idempotencyResult.response;

  let body: { name?: string; lastName?: string; email?: string };
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }

  const { name, lastName, email } = body;

  if (!name || !lastName || !email) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Fields name, lastName and email are required.",
      400
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return errorResponse("VALIDATION_ERROR", "Invalid email format.", 400);
  }

  try {
    const user = await prisma.user.create({
      data: { name, lastName, email },
      select: { id: true, name: true, lastName: true, email: true },
    });

    const responseBody = JSON.stringify(user);
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
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return errorResponse(
        "CONFLICT",
        "A user with that email already exists.",
        409
      );
    }
    throw err;
  }
}
