import { describe, it, expect } from "vitest";
import { action } from "../app/routes/tasks.$idTask.complete";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

async function setupTaskWithUsers(userCount: number) {
  const task = await prisma.task.create({ data: { title: "Concurrent task" } });
  const users = await Promise.all(
    Array.from({ length: userCount }, (_, i) =>
      prisma.user.create({
        data: {
          name: `User${i}`,
          lastName: `Last${i}`,
          email: `user${i}@test.com`,
        },
      })
    )
  );
  await prisma.taskAssignment.createMany({
    data: users.map((u) => ({ taskId: task.id, userId: u.id })),
  });
  return { task, users };
}

describe("POST /tasks/:idTask/complete", () => {
  it("marks a user's assignment as complete", async () => {
    const { task, users } = await setupTaskWithUsers(2);
    const [u1] = users;

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/complete`,
        { userId: u1.id },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(200);

    const assignment = await prisma.taskAssignment.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: u1.id } },
    });
    expect(assignment?.completed).toBe(true);
    expect(assignment?.completedAt).not.toBeNull();
  });

  it("archives the task when all users complete", async () => {
    const { task, users } = await setupTaskWithUsers(1);
    const [u1] = users;

    await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/complete`,
        { userId: u1.id },
        undefined,
        { idTask: String(task.id) }
      )
    );

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe("archived");
    expect(updated?.archivedAt).not.toBeNull();
  });

  it("returns 400 if user is not assigned to the task", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });
    const user = await prisma.user.create({
      data: { name: "X", lastName: "X", email: "x@test.com" },
    });

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/complete`,
        { userId: user.id },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_ASSIGNED");
  });

  it("returns 404 for non-existent task", async () => {
    const user = await prisma.user.create({
      data: { name: "Y", lastName: "Y", email: "y@test.com" },
    });

    const res = await action(
      makeArgs("POST", "/tasks/99999/complete", { userId: user.id }, undefined, {
        idTask: "99999",
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent user", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/complete`,
        { userId: 999999 },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(404);
  });
});

describe("Concurrency: POST /tasks/:idTask/complete (parallel)", () => {
  it("archives the task exactly once when two last users complete simultaneously", async () => {
    const { task, users } = await setupTaskWithUsers(2);
    const [u1, u2] = users;

    await Promise.all([
      action(
        makeArgs(
          "POST",
          `/tasks/${task.id}/complete`,
          { userId: u1.id },
          undefined,
          { idTask: String(task.id) }
        )
      ),
      action(
        makeArgs(
          "POST",
          `/tasks/${task.id}/complete`,
          { userId: u2.id },
          undefined,
          { idTask: String(task.id) }
        )
      ),
    ]);

    const archived = await prisma.task.findUnique({ where: { id: task.id } });
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).not.toBeNull();

    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
    });
    expect(assignments.every((a) => a.completed)).toBe(true);
  });

  it("triggers exactly one notification chain when task is archived concurrently", async () => {
    const { task, users } = await setupTaskWithUsers(2);
    const [u1, u2] = users;

    await Promise.all([
      action(
        makeArgs(
          "POST",
          `/tasks/${task.id}/complete`,
          { userId: u1.id },
          undefined,
          { idTask: String(task.id) }
        )
      ),
      action(
        makeArgs(
          "POST",
          `/tasks/${task.id}/complete`,
          { userId: u2.id },
          undefined,
          { idTask: String(task.id) }
        )
      ),
    ]);

    // Wait for the async notification attempt to be persisted
    await new Promise((r) => setTimeout(r, 500));

    const attempts = await prisma.notificationAttempt.findMany({
      where: { taskId: task.id },
    });

    // Exactly 1 attempt chain (not 2 parallel chains)
    expect(attempts.length).toBe(1);
    expect(attempts[0].attemptNumber).toBe(1);
  });
});
