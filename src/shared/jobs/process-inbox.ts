import { and, eq, inArray, isNull, lt, lte, or, asc } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { webhookInbox } from "@/shared/db/schema/jobs";
import {
  type InboxHandler,
  type WorkerOptions,
  type JobResult,
  type WebhookInboxRow,
  type DbOrTx,
  DEFAULT_BASE_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
  MAX_ATTEMPTS,
  calculateBackoff,
} from "./types";

const globalInboxHandlers = new Map<string, InboxHandler>();

export function registerInboxHandler(providerEnv: string, handler: InboxHandler): void {
  globalInboxHandlers.set(providerEnv, handler);
}

export function getInboxHandler(providerEnv: string): InboxHandler | undefined {
  return globalInboxHandlers.get(providerEnv);
}

export function clearInboxHandlers(): void {
  globalInboxHandlers.clear();
}

/**
 * Claims and processes a batch of inbox webhook events.
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent claim race conditions.
 */
export async function processInbox(
  dbOrTx: DbOrTx = defaultDb,
  options: WorkerOptions = {}
): Promise<JobResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const now = options.now ? options.now() : new Date();

  const runWithTx = async (tx: DbOrTx): Promise<WebhookInboxRow[]> => {
    const claimedRows = await tx
      .select()
      .from(webhookInbox)
      .where(
        and(
          lt(webhookInbox.attempts, maxAttempts),
          or(
            and(
              inArray(webhookInbox.status, ["pending", "retry"]),
              or(isNull(webhookInbox.leaseUntil), lt(webhookInbox.leaseUntil, now)),
              lte(webhookInbox.nextAttemptAt, now)
            ),
            and(
              eq(webhookInbox.status, "processing"),
              lt(webhookInbox.leaseUntil, now)
            )
          )
        )
      )
      .orderBy(asc(webhookInbox.nextAttemptAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });

    if (!claimedRows || claimedRows.length === 0) {
      return [];
    }

    const leaseUntil = new Date(now.getTime() + leaseDurationMs);
    const claimedIds = claimedRows.map((r) => r.id);

    await tx
      .update(webhookInbox)
      .set({
        status: "processing",
        leaseUntil,
        updatedAt: now,
      })
      .where(inArray(webhookInbox.id, claimedIds));

    return claimedRows;
  };

  const claimedRows: WebhookInboxRow[] =
    typeof dbOrTx.transaction === "function"
      ? await (dbOrTx.transaction as unknown as (cb: (tx: DbOrTx) => Promise<WebhookInboxRow[]>) => Promise<WebhookInboxRow[]>)(runWithTx)
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

  const validCreatedTimes = claimedRows
    .map((r) => (r.createdAt ? new Date(r.createdAt).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));

  const oldestPendingAgeMs =
    validCreatedTimes.length > 0
      ? Math.max(0, now.getTime() - Math.min(...validCreatedTimes))
      : null;

  for (const event of claimedRows) {
    if (event.status === "processed") {
      continue;
    }

    const handler =
      (options.handlers?.[event.providerEnv] as InboxHandler | undefined) ??
      globalInboxHandlers.get(event.providerEnv);

    if (!handler) {
      const nextAttempts = (event.attempts ?? 0) + 1;
      const errorCode = `NO_HANDLER_${event.providerEnv}`.slice(0, 64);

      if (nextAttempts >= maxAttempts) {
        await dbOrTx
          .update(webhookInbox)
          .set({
            status: "dead",
            attempts: nextAttempts,
            leaseUntil: null,
            errorCode,
            updatedAt: new Date(),
          })
          .where(eq(webhookInbox.id, event.id));
        deadCount++;
      } else {
        const backoffMs = calculateBackoff(nextAttempts, {
          baseMs,
          jitter: options.jitter,
        });
        await dbOrTx
          .update(webhookInbox)
          .set({
            status: "retry",
            attempts: nextAttempts,
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + backoffMs),
            errorCode,
            updatedAt: new Date(),
          })
          .where(eq(webhookInbox.id, event.id));
        retriedCount++;
      }
      continue;
    }

    try {
      await handler(event);

      await dbOrTx
        .update(webhookInbox)
        .set({
          status: "processed",
          leaseUntil: null,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(webhookInbox.id, event.id));

      processedCount++;
    } catch (err: unknown) {
      const nextAttempts = (event.attempts ?? 0) + 1;
      const errorMessage = (err instanceof Error ? err.message : "HANDLER_ERROR").slice(0, 64);

      if (nextAttempts >= maxAttempts) {
        await dbOrTx
          .update(webhookInbox)
          .set({
            status: "dead",
            attempts: nextAttempts,
            leaseUntil: null,
            errorCode: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(webhookInbox.id, event.id));

        deadCount++;
      } else {
        const backoffMs = calculateBackoff(nextAttempts, {
          baseMs,
          jitter: options.jitter,
        });

        await dbOrTx
          .update(webhookInbox)
          .set({
            status: "retry",
            attempts: nextAttempts,
            leaseUntil: null,
            nextAttemptAt: new Date(now.getTime() + backoffMs),
            errorCode: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(webhookInbox.id, event.id));

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

export async function runInboxWorker(options?: WorkerOptions): Promise<JobResult> {
  return processInbox(defaultDb, options);
}
