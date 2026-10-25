import { pgTable, text, timestamp, uuid, varchar, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { chapterVariants } from "./catalog";
import { locales } from "./identity";

export const contentDrafts = pgTable("content_drafts", {
  variantId: uuid("variant_id")
    .primaryKey()
    .references(() => chapterVariants.id, { onDelete: "restrict" }),
  sourceMd: text("source_md").notNull(),
  identityManifest: jsonb("identity_manifest").default({}).notNull(),
  version: integer("version").default(1).notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => chapterVariants.id, { onDelete: "restrict" }),
    sourceMd: text("source_md").notNull(),
    sourceSha256: varchar("source_sha256", { length: 64 }).notNull(),
    manifestSha256: varchar("manifest_sha256", { length: 64 }).notNull(),
    compilerVersion: varchar("compiler_version", { length: 32 }).notNull(),
    sanitizerVersion: varchar("sanitizer_version", { length: 32 }).notNull(),
    html: text("html").notNull(),
    metadataJson: jsonb("metadata_json").default({}).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("content_revisions_variant_id_id_unique").on(table.variantId, table.id),
    index("content_revisions_variant_created_idx").on(table.variantId, table.createdAt),
  ]
);

export const publishedPreviews = pgTable("published_previews", {
  variantId: uuid("variant_id")
    .primaryKey()
    .references(() => chapterVariants.id, { onDelete: "restrict" }),
  previewText: text("preview_text").notNull(),
  previewHtml: text("preview_html").notNull(),
  version: integer("version").default(1).notNull(),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const dictionaryRevisions = pgTable(
  "dictionary_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locale: varchar("locale", { length: 16 })
      .notNull()
      .references(() => locales.code),
    messagesJson: jsonb("messages_json").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dictionary_revisions_locale_id_unique").on(table.locale, table.id),
  ]
);

export const dictionaryPublications = pgTable("dictionary_publications", {
  locale: varchar("locale", { length: 16 })
    .primaryKey()
    .references(() => locales.code),
  revisionId: uuid("revision_id")
    .notNull()
    .references(() => dictionaryRevisions.id, { onDelete: "restrict" }),
  generation: integer("generation").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
