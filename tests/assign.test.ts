import { describe, it, expect } from "vitest";
import { action } from "../app/routes/tasks.$idTask.assign";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

describe("POST /tasks/:idTask/assign", () => {
  it("assigns multiple users to a task", async () => {
    const task = await prisma.task.create({ data: { title: "Team task" } });
    const [u1, u2] = await Promise.all([
      prisma.user.create({ data: { name: "A", lastName: "A", email: "a@test.com" } }),
      prisma.user.create({ data: { name: "B", lastName: "B", email: "b@test.com" } }),
    ]);

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: [u1.id, u2.id] },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(200);
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: task.id },
    });
    expect(assignments.length).toBe(2);
  });

  it("returns 404 if task does not exist", async () => {
    const user = await prisma.user.create({
      data: { name: "X", lastName: "X", email: "x@test.com" },
    });

    const res = await action(
      makeArgs("POST", "/tasks/99999/assign", { userIds: [user.id] }, undefined, {
        idTask: "99999",
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 if a userId does not exist", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: [999999] },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("does not duplicate assignment if user is already assigned (idempotent)", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });
    const user = await prisma.user.create({
      data: { name: "D", lastName: "D", email: "d@test.com" },
    });

    await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: [user.id] },
        undefined,
        { idTask: String(task.id) }
      )
    );

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: [user.id] },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(200);
    const count = await prisma.taskAssignment.count({
      where: { taskId: task.id, userId: user.id },
    });
    expect(count).toBe(1);
  });

  it("returns 400 for invalid userIds format", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: "not-an-array" },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(400);
  });

  it("rolls back if any userId is invalid (no partial assignments)", async () => {
    const task = await prisma.task.create({ data: { title: "Task" } });
    const validUser = await prisma.user.create({
      data: { name: "E", lastName: "E", email: "e@test.com" },
    });

    const res = await action(
      makeArgs(
        "POST",
        `/tasks/${task.id}/assign`,
        { userIds: [validUser.id, 999999] },
        undefined,
        { idTask: String(task.id) }
      )
    );

    expect(res.status).toBe(404);
    const count = await prisma.taskAssignment.count({ where: { taskId: task.id } });
    expect(count).toBe(0);
  });
});
