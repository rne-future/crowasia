import { customType, index, pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { chapterVariants } from "./catalog";
import { contentRevisions } from "./content";

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const searchPublic = pgTable(
  "search_public",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => chapterVariants.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    previewText: text("preview_text").notNull(),
    tags: jsonb("tags").default([]).notNull(),
    document: tsvector("document").notNull(),
  },
  (table) => [
    index("search_public_document_gin_idx").using("gin", table.document),
  ]
);

export const searchPrivate = pgTable(
  "search_private",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => chapterVariants.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    document: tsvector("document").notNull(),
  },
  (table) => [
    index("search_private_document_gin_idx").using("gin", table.document),
  ]
);
