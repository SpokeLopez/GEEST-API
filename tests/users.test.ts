import { describe, it, expect } from "vitest";
import { loader, action } from "../app/routes/users";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

describe("GET /users", () => {
  it("returns an empty array when no users exist", async () => {
    const res = await loader(makeArgs("GET", "/users"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("returns users with their pending tasks", async () => {
    const user = await prisma.user.create({
      data: { name: "Ana", lastName: "López", email: "ana@test.com" },
    });
    const task = await prisma.task.create({ data: { title: "Tarea 1" } });
    await prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id },
    });

    const res = await loader(makeArgs("GET", "/users"));
    const data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].email).toBe("ana@test.com");
    expect(data[0].pendingTasks.length).toBe(1);
  });
});

describe("POST /users", () => {
  it("creates a user and returns 201", async () => {
    const res = await action(
      makeArgs("POST", "/users", {
        name: "John",
        lastName: "Doe",
        email: "john@example.com",
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.email).toBe("john@example.com");
    expect(data.id).toBeTypeOf("number");
  });

  it("returns 400 when name is missing", async () => {
    const res = await action(
      makeArgs("POST", "/users", { lastName: "Doe", email: "john@example.com" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid email", async () => {
    const res = await action(
      makeArgs("POST", "/users", {
        name: "John",
        lastName: "Doe",
        email: "not-an-email",
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for duplicate email", async () => {
    await prisma.user.create({
      data: { name: "Jane", lastName: "Doe", email: "jane@example.com" },
    });

    const res = await action(
      makeArgs("POST", "/users", {
        name: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
      })
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("CONFLICT");
  });
});
