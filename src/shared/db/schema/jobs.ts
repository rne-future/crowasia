import { pgTable, timestamp, uuid, varchar, integer, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";

export const webhookStatusEnum = pgEnum("webhook_status", [
  "pending",
  "processing",
  "retry",
  "processed",
  "rejected",
  "dead",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "processing",
  "retry",
  "completed",
  "processed",
  "failed",
  "dead",
]);

export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerEnv: varchar("provider_env", { length: 32 }).notNull(),
    eventKey: varchar("event_key", { length: 128 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    normalizedJson: jsonb("normalized_json").notNull(),
    status: webhookStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
    errorCode: varchar("error_code", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_inbox_provider_env_event_key_unique").on(table.providerEnv, table.eventKey),
    index("webhook_inbox_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
  ]
);

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: varchar("kind", { length: 64 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 128 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 128 }).notNull().unique(),
    payloadJson: jsonb("payload_json").notNull(),
    status: jobStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("outbox_jobs_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
  ]
);
