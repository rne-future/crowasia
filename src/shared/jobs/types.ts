import type { webhookInbox, outboxJobs } from "@/shared/db/schema/jobs";
import type { Database } from "@/shared/db/client";

export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | DbTransaction;

export type InboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "processed"
  | "rejected"
  | "dead";

export type OutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "completed"
  | "processed"
  | "failed"
  | "dead";

export type WebhookInboxRow = typeof webhookInbox.$inferSelect;
export type WebhookInboxInsert = typeof webhookInbox.$inferInsert;

export type OutboxJobRow = typeof outboxJobs.$inferSelect;
export type OutboxJobInsert = typeof outboxJobs.$inferInsert;

export type InboxHandler = (event: WebhookInboxRow) => Promise<void>;
export type OutboxHandler = (job: OutboxJobRow) => Promise<void>;

export interface JobResult {
  claimed: number;
  processed: number;
  retried: number;
  dead: number;
  rejected?: number;
  failed?: number;
  oldestPendingAgeMs?: number | null;
}

export interface WorkerOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  baseMs?: number;
  maxAttempts?: number;
  now?: () => Date;
  jitter?: number | boolean;
  handlers?: Record<string, InboxHandler | OutboxHandler>;
}

export const MAX_ATTEMPTS = 8;
export const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes = 900,000 ms
export const DEFAULT_BASE_MS = 1000;
export const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_BATCH_SIZE = 10;

/**
 * Calculates exponential backoff with jitter capped at 15 minutes:
 * min(baseMs * 2^attempt + jitter, 15 * 60 * 1000)
 */
export function calculateBackoff(
  attempt: number,
  options?: {
    baseMs?: number;
    maxMs?: number;
    jitter?: number | boolean;
  }
): number {
  const baseMs = options?.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = options?.maxMs ?? MAX_BACKOFF_MS;
  const safeAttempt = Math.max(0, attempt);

  const exponential = baseMs * Math.pow(2, safeAttempt);

  let jitterMs = 0;
  if (typeof options?.jitter === "number") {
    jitterMs = options.jitter;
  } else if (options?.jitter !== false) {
    // Default jitter: pseudo-random between 0 and 50% of baseMs
    jitterMs = Math.floor(Math.random() * (baseMs * 0.5));
  }

  return Math.min(exponential + jitterMs, maxMs);
}
