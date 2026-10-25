import { db as defaultDb } from "@/shared/db/client";
import { webhookInbox } from "@/shared/db/schema/jobs";
import {
  processInbox,
  runInboxWorker,
  registerInboxHandler,
  getInboxHandler,
  clearInboxHandlers,
} from "./process-inbox";
import type { WorkerOptions, JobResult, DbOrTx } from "./types";

export interface InsertInboxEventParams {
  providerEnv: string;
  eventKey: string;
  payloadHash: string;
  normalizedJson: unknown;
}

/**
 * Inserts a webhook event into the inbox table within the caller's transaction or DB client.
 * Duplicate providerEnv + eventKey is safely ignored (idempotent / no side-effect).
 */
export async function insertInboxEvent(
  txOrDb: DbOrTx = defaultDb,
  params: InsertInboxEventParams
): Promise<void> {
  await txOrDb
    .insert(webhookInbox)
    .values({
      providerEnv: params.providerEnv,
      eventKey: params.eventKey,
      payloadHash: params.payloadHash,
      normalizedJson: params.normalizedJson,
      status: "pending",
    })
    .onConflictDoNothing();
}

export {
  processInbox,
  runInboxWorker,
  registerInboxHandler,
  getInboxHandler,
  clearInboxHandlers,
};
export type { WorkerOptions, JobResult };
