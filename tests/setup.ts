import { prisma } from "../app/lib/db.server";
import { afterAll, beforeEach } from "vitest";

beforeEach(async () => {
  // Clean all tables in dependency order before each test
  await prisma.notificationAttempt.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
