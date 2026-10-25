import { pgTable, text, timestamp, uuid, varchar, jsonb, index } from "drizzle-orm/pg-core";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id"),
    action: varchar("action", { length: 64 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 128 }).notNull(),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 64 }),
    safeDiffJson: jsonb("safe_diff_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_agg_created_idx").on(table.aggregateType, table.aggregateId, table.createdAt),
  ]
);
