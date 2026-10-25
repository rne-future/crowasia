import { db as defaultDb } from "@/shared/db/client";
import { outboxJobs } from "@/shared/db/schema/jobs";
import {
  processOutbox,
  runOutboxWorker,
  registerOutboxHandler,
  getOutboxHandler,
  clearOutboxHandlers,
} from "./process-outbox";
import type { WorkerOptions, JobResult, DbOrTx } from "./types";

export interface EnqueueOutboxJobParams {
  kind: string;
  aggregateId: string;
  dedupeKey: string;
  payload: unknown;
}

/**
 * Inserts a job into the outbox table within the caller's transaction or DB client.
 * Duplicate dedupeKey is safely ignored (idempotent / no side-effect).
 */
export async function enqueueOutboxJob(
  txOrDb: DbOrTx = defaultDb,
  params: EnqueueOutboxJobParams
): Promise<void> {
  await txOrDb
    .insert(outboxJobs)
    .values({
      kind: params.kind,
      aggregateId: params.aggregateId,
      dedupeKey: params.dedupeKey,
      payloadJson: params.payload,
      status: "pending",
    })
    .onConflictDoNothing();
}

export {
  processOutbox,
  runOutboxWorker,
  registerOutboxHandler,
  getOutboxHandler,
  clearOutboxHandlers,
};
export type { WorkerOptions, JobResult };
