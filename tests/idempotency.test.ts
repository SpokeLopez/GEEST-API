import { describe, it, expect } from "vitest";
import { action as usersAction } from "../app/routes/users";
import { action as tasksAction } from "../app/routes/tasks";
import { prisma } from "../app/lib/db.server";
import { makeArgs } from "./helpers";

describe("Idempotency-Key header", () => {
  it("two concurrent POST /users with the same key return identical responses and create one row", async () => {
    const key = `idem-${Date.now()}`;
    const email = `idem-${Date.now()}@test.com`;
    const body = { name: "Idem", lastName: "User", email };

    const [res1, res2] = await Promise.all([
      usersAction(makeArgs("POST", "/users", body, { "Idempotency-Key": key })),
      usersAction(makeArgs("POST", "/users", body, { "Idempotency-Key": key })),
    ]);

    const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(data1.id).toBe(data2.id);
    expect(data1.email).toBe(data2.email);

    // Only one user in DB
    const userCount = await prisma.user.count({ where: { email } });
    expect(userCount).toBe(1);

    // Only one idempotency row
    const idemCount = await prisma.idempotencyKey.count({
      where: { key, endpoint: "/users" },
    });
    expect(idemCount).toBe(1);
  });

  it("returns 422 when the same Idempotency-Key is reused with a different body", async () => {
    const key = `idem-mismatch-${Date.now()}`;

    await usersAction(
      makeArgs(
        "POST",
        "/users",
        { name: "First", lastName: "User", email: `first-${Date.now()}@test.com` },
        { "Idempotency-Key": key }
      )
    );

    const res = await usersAction(
      makeArgs(
        "POST",
        "/users",
        {
          name: "Different",
          lastName: "User",
          email: `different-${Date.now()}@test.com`,
        },
        { "Idempotency-Key": key }
      )
    );

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error.code).toBe("IDEMPOTENCY_MISMATCH");
  });

  it("replays response for POST /tasks with the same key", async () => {
    const key = `tasks-idem-${Date.now()}`;
    const title = `Idem Task ${Date.now()}`;

    const res1 = await tasksAction(
      makeArgs("POST", "/tasks", { title }, { "Idempotency-Key": key })
    );
    const res2 = await tasksAction(
      makeArgs("POST", "/tasks", { title }, { "Idempotency-Key": key })
    );

    const [d1, d2] = await Promise.all([res1.json(), res2.json()]);

    expect(d1.id).toBe(d2.id);
    expect(d1.title).toBe(d2.title);

    const taskCount = await prisma.task.count({ where: { title } });
    expect(taskCount).toBe(1);
  });

  it("requests without Idempotency-Key are not deduplicated", async () => {
    const title = `Non-idem Task ${Date.now()}`;

    await tasksAction(makeArgs("POST", "/tasks", { title }));
    await tasksAction(makeArgs("POST", "/tasks", { title }));

    const taskCount = await prisma.task.count({ where: { title } });
    expect(taskCount).toBe(2);
  });
});
