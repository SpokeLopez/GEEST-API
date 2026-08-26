import { describe, it, expect } from "vitest";
import { action as completeAction } from "../app/routes/tasks.$idTask.complete";
import { loader as notificationsLoader } from "../app/routes/tasks.$idTask.notifications";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

describe("GET /tasks/:idTask/notifications", () => {
  it("returns empty array for a task with no notification attempts", async () => {
    const task = await prisma.task.create({ data: { title: "New task" } });

    const res = await notificationsLoader(
      makeArgs("GET", `/tasks/${task.id}/notifications`, undefined, undefined, {
        idTask: String(task.id),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await notificationsLoader(
      makeArgs("GET", "/tasks/99999/notifications", undefined, undefined, {
        idTask: "99999",
      })
    );
    expect(res.status).toBe(404);
  });

  it("records a notification attempt when a task is archived", async () => {
    const user = await prisma.user.create({
      data: { name: "Notif", lastName: "Test", email: "notif@test.com" },
    });
    const task = await prisma.task.create({ data: { title: "Notif task" } });
    await prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id },
    });

    await completeAction(
      makeArgs(
        "POST",
        `/tasks/${task.id}/complete`,
        { userId: user.id },
        undefined,
        { idTask: String(task.id) }
      )
    );

    // Wait for the async notification attempt to be persisted
    await new Promise((r) => setTimeout(r, 300));

    const res = await notificationsLoader(
      makeArgs("GET", `/tasks/${task.id}/notifications`, undefined, undefined, {
        idTask: String(task.id),
      })
    );

    const attempts = await res.json();
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0].attemptNumber).toBe(1);
    expect(attempts[0].httpStatus).toBeNull();
    expect(attempts[0].succeeded).toBe(false);
  });

  it("returns attempts ordered by attemptNumber", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });
    await prisma.notificationAttempt.createMany({
      data: [
        { taskId: task.id, attemptNumber: 3, httpStatus: null, succeeded: false },
        { taskId: task.id, attemptNumber: 1, httpStatus: 500, succeeded: false },
        { taskId: task.id, attemptNumber: 2, httpStatus: null, succeeded: false },
      ],
    });

    const res = await notificationsLoader(
      makeArgs("GET", `/tasks/${task.id}/notifications`, undefined, undefined, {
        idTask: String(task.id),
      })
    );

    const attempts = await res.json();
    expect(
      attempts.map((a: { attemptNumber: number }) => a.attemptNumber)
    ).toEqual([1, 2, 3]);
  });
});
