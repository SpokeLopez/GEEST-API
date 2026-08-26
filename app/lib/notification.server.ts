import { prisma } from "~/lib/db.server";

const MAX_ATTEMPTS = 3;
// Delays (ms) before retrying after failure: 1s, then 5s
const RETRY_DELAYS = [1_000, 5_000];
const FETCH_TIMEOUT_MS = 10_000;

async function executeAttempt(
  taskId: number,
  title: string,
  archivedAt: Date,
  attemptNumber: number
): Promise<void> {
  if (attemptNumber > MAX_ATTEMPTS) return;

  const notifyUrl = process.env.NOTIFY_URL;
  let httpStatus: number | null = null;
  let succeeded = false;

  if (notifyUrl) {
    try {
      const res = await fetch(notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          title,
          archivedAt: archivedAt.toISOString(),
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      httpStatus = res.status;
      succeeded = res.ok;
    } catch {
      // Network error or timeout — httpStatus stays null, succeeded stays false
    }
  }
  // If NOTIFY_URL is not configured: record attempt with null httpStatus (succeeded=false)

  try {
    await prisma.notificationAttempt.create({
      data: { taskId, attemptNumber, httpStatus, succeeded },
    });
  } catch (err) {
    console.error("[notification] Failed to record attempt:", err);
  }

  if (!succeeded && attemptNumber < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS[attemptNumber - 1]; // 1000ms after attempt 1, 5000ms after attempt 2
    setTimeout(() => {
      executeAttempt(taskId, title, archivedAt, attemptNumber + 1).catch(
        console.error
      );
    }, delay);
  }
}

/**
 * Fires notification for a newly archived task.
 * Non-blocking: runs in background via setTimeout chain.
 */
export function sendNotification(
  taskId: number,
  title: string,
  archivedAt: Date
): void {
  executeAttempt(taskId, title, archivedAt, 1).catch(console.error);
}

/**
 * Called on server startup to resume notification chains
 * that were interrupted by a process restart.
 */
export async function recoverPendingNotifications(): Promise<void> {
  try {
    const archivedTasks = await prisma.task.findMany({
      where: { status: "archived" },
      include: { notificationAttempts: { orderBy: { attemptNumber: "asc" } } },
    });

    for (const task of archivedTasks) {
      const attempts = task.notificationAttempts;
      const alreadySucceeded = attempts.some((a) => a.succeeded);
      if (alreadySucceeded) continue;
      if (attempts.length >= MAX_ATTEMPTS) continue;

      const nextAttempt = attempts.length + 1;
      console.log(
        `[notification] Recovering task ${task.id}: resuming from attempt ${nextAttempt}`
      );
      executeAttempt(
        task.id,
        task.title,
        task.archivedAt!,
        nextAttempt
      ).catch(console.error);
    }
  } catch (err) {
    console.error("[notification] Recovery failed:", err);
  }
}
