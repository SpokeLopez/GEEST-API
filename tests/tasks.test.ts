import { describe, it, expect } from "vitest";
import { loader, action } from "../app/routes/tasks";
import { loader as taskLoader } from "../app/routes/tasks.$idTask";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

describe("POST /tasks", () => {
  it("creates a task and returns 201", async () => {
    const res = await action(
      makeArgs("POST", "/tasks", {
        title: "Fix bug",
        description: "Critical bug in production",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Fix bug");
    expect(data.status).toBe("open");
    expect(data.id).toBeTypeOf("number");
  });

  it("returns 400 when title is missing", async () => {
    const res = await action(
      makeArgs("POST", "/tasks", { description: "No title" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a task without description", async () => {
    const res = await action(makeArgs("POST", "/tasks", { title: "Simple task" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.description).toBeNull();
  });
});

describe("GET /tasks", () => {
  it("returns all tasks", async () => {
    await prisma.task.createMany({
      data: [{ title: "Task A" }, { title: "Task B" }],
    });

    const res = await loader(makeArgs("GET", "/tasks"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(2);
  });

  it("filters tasks by status=open", async () => {
    await prisma.task.createMany({
      data: [
        { title: "Open task", status: "open" },
        { title: "Archived task", status: "archived" },
      ],
    });

    const res = await loader(makeArgs("GET", "/tasks?status=open"));
    const data = await res.json();
    expect(data.every((t: { status: string }) => t.status === "open")).toBe(true);
  });

  it("filters tasks by status=archived", async () => {
    await prisma.task.createMany({
      data: [
        { title: "Open task", status: "open" },
        { title: "Archived task", status: "archived" },
      ],
    });

    const res = await loader(makeArgs("GET", "/tasks?status=archived"));
    const data = await res.json();
    expect(data.every((t: { status: string }) => t.status === "archived")).toBe(true);
  });

  it("includes assignments in each task", async () => {
    const user = await prisma.user.create({
      data: { name: "Luis", lastName: "García", email: "luis@test.com" },
    });
    const task = await prisma.task.create({ data: { title: "Task with user" } });
    await prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id },
    });

    const res = await loader(makeArgs("GET", "/tasks"));
    const data = await res.json();
    expect(data[0].assignments.length).toBe(1);
    expect(data[0].assignments[0].userId).toBe(user.id);
  });
});

describe("GET /tasks/:idTask", () => {
  it("returns a task with assignments", async () => {
    const task = await prisma.task.create({ data: { title: "Detail task" } });
    const user = await prisma.user.create({
      data: { name: "Carlos", lastName: "Ruiz", email: "carlos@test.com" },
    });
    await prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id },
    });

    const res = await taskLoader(
      makeArgs("GET", `/tasks/${task.id}`, undefined, undefined, {
        idTask: String(task.id),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Detail task");
    expect(data.assignments.length).toBe(1);
    expect(data.assignments[0].user.email).toBe("carlos@test.com");
  });

  it("returns 404 for non-existent task", async () => {
    const res = await taskLoader(
      makeArgs("GET", "/tasks/99999", undefined, undefined, { idTask: "99999" })
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });
});
