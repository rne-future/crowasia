import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar, integer, boolean, primaryKey, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { chapters, books } from "./catalog";
import { contentRevisions } from "./content";

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "restrict" }),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("checklist_items_chapter_id_idx").on(table.chapterId),
  ]
);

export const revisionChecklistItems = pgTable(
  "revision_checklist_items",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => checklistItems.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    labelText: text("label_text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.itemId] }),
    uniqueIndex("rev_checklist_items_rev_ordinal_unique").on(table.revisionId, table.ordinal),
  ]
);

export const checklistProgress = pgTable(
  "checklist_progress",
  {
    userId: uuid("user_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => checklistItems.id, { onDelete: "restrict" }),
    completed: boolean("completed").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    check("checklist_progress_version_check", sql`"version" >= 1`),
    index("checklist_progress_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

export const readingProgress = pgTable(
  "reading_progress",
  {
    userId: uuid("user_id").notNull(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "restrict" }),
    revisionId: uuid("revision_id").references(() => contentRevisions.id, { onDelete: "set null" }),
    anchorId: varchar("anchor_id", { length: 128 }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.bookId] }),
  ]
);
