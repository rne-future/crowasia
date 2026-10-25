import { and, eq, inArray, isNull, lt, lte, or, asc } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/shared/db/client";
import { outboxJobs } from "@/shared/db/schema/jobs";
import {
  type OutboxHandler,
  type WorkerOptions,
  type JobResult,
  type OutboxJobRow,
  DEFAULT_BASE_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
  MAX_ATTEMPTS,
  calculateBackoff,
} from "./types";

const globalOutboxHandlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(kind: string, handler: OutboxHandler): void {
  globalOutboxHandlers.set(kind, handler);
}

export function getOutboxHandler(kind: string): OutboxHandler | undefined {
  return globalOutboxHandlers.get(kind);
}

export function clearOutboxHandlers(): void {
  globalOutboxHandlers.clear();
}

/**
 * Claims and processes a batch of outbox jobs.
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent worker collisions.
 * Preserves dedupe_key uniqueness and handles exponential backoff and dead lettering.
 */
export async function processOutbox(
  dbOrTx: Database = defaultDb,
  options: WorkerOptions = {}
): Promise<JobResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const now = options.now ? options.now() : new Date();

  const runWithTx = async (tx: Database): Promise<OutboxJobRow[]> => {
    const claimedRows = await tx
      .select()
      .from(outboxJobs)
      .where(
        and(
          inArray(outboxJobs.status, ["pending", "retry"]),
          lt(outboxJobs.attempts, maxAttempts),
          or(isNull(outboxJobs.leaseUntil), lt(outboxJobs.leaseUntil, now)),
          lte(outboxJobs.nextAttemptAt, now)
        )
      )
      .orderBy(asc(outboxJobs.nextAttemptAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });

    if (!claimedRows || claimedRows.length === 0) {
      return [];
    }

    const leaseUntil = new Date(now.getTime() + leaseDurationMs);
    const claimedIds = claimedRows.map((r) => r.id);

    await tx
      .update(outboxJobs)
      .set({
        status: "processing",
        leaseUntil,
        updatedAt: now,
      })
      .where(inArray(outboxJobs.id, claimedIds));

    return claimedRows;
  };

  const claimedRows: OutboxJobRow[] =
    typeof dbOrTx.transaction === "function"
      ? await (dbOrTx.transaction as unknown as (cb: (tx: Database) => Promise<OutboxJobRow[]>) => Promise<OutboxJobRow[]>)(runWithTx)
      : await runWithTx(dbOrTx);

  if (!claimedRows || claimedRows.length === 0) {
    return {
      claimed: 0,
      processed: 0,
      retried: 0,
      dead: 0,
      oldestPendingAgeMs: null,
    };
  }

  let processedCount = 0;
  let retriedCount = 0;
  let deadCount = 0;

  const oldestJob = claimedRows[0];
  const oldestPendingAgeMs = oldestJob?.createdAt
    ? Math.max(0, now.getTime() - new Date(oldestJob.createdAt).getTime())
    : null;

  for (const job of claimedRows) {
    if (job.status === "processed" || job.status === "completed") {
      continue;
    }

    const handler =
      (options.handlers?.[job.kind] as OutboxHandler | undefined) ??
      globalOutboxHandlers.get(job.kind);

    if (!handler) {
      const nextAttempts = (job.attempts ?? 0) + 1;

      if (nextAttempts >= maxAttempts) {
        await dbOrTx
          .update(outboxJobs)
          .set({
            status: "dead",
            attempts: nextAttempts,
            leaseUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(outboxJobs.id, job.id));
        deadCount++;
      } else {
        const backoffMs = calculateBackoff(nextAttempts, {
          baseMs,
          jitter: options.jitter,
        });
        await dbOrTx
          .update(outboxJobs)
          .set({
            status: "retry",
            attempts: nextAttempts,
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + backoffMs),
            updatedAt: new Date(),
          })
          .where(eq(outboxJobs.id, job.id));
        retriedCount++;
      }
      continue;
    }

    try {
      await handler(job);

      await dbOrTx
        .update(outboxJobs)
        .set({
          status: "processed",
          completedAt: new Date(),
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(outboxJobs.id, job.id));

      processedCount++;
    } catch {
      const nextAttempts = (job.attempts ?? 0) + 1;

      if (nextAttempts >= maxAttempts) {
        await dbOrTx
          .update(outboxJobs)
          .set({
            status: "dead",
            attempts: nextAttempts,
            leaseUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(outboxJobs.id, job.id));

        deadCount++;
      } else {
        const backoffMs = calculateBackoff(nextAttempts, {
          baseMs,
          jitter: options.jitter,
        });

        await dbOrTx
          .update(outboxJobs)
          .set({
            status: "retry",
            attempts: nextAttempts,
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + backoffMs),
            updatedAt: new Date(),
          })
          .where(eq(outboxJobs.id, job.id));

        retriedCount++;
      }
    }
  }

  return {
    claimed: claimedRows.length,
    processed: processedCount,
    retried: retriedCount,
    dead: deadCount,
    oldestPendingAgeMs,
  };
}

export async function runOutboxWorker(options?: WorkerOptions): Promise<JobResult> {
  return processOutbox(defaultDb, options);
}
