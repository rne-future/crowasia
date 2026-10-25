import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar, integer, boolean, bigint, pgEnum, primaryKey, uniqueIndex, check } from "drizzle-orm/pg-core";
import { locales } from "./identity";

export const bookStatusEnum = pgEnum("book_status", ["draft", "published", "archived"]);
export const registerEnum = pgEnum("register_type", ["standard", "casual"]);
export const tierStatusEnum = pgEnum("tier_status", ["active", "inactive", "archived"]);

export const books = pgTable("books", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  status: bookStatusEnum("status").default("draft").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
    index: integer("index").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    isFreeSample: boolean("is_free_sample").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chapters_book_id_index_unique").on(table.bookId, table.index),
    uniqueIndex("chapters_book_id_slug_unique").on(table.bookId, table.slug),
    check("chapters_index_range_check", sql`"index" >= 0 AND "index" <= 14`),
    check("chapters_free_sample_check", sql`"is_free_sample" = ("index" IN (0, 1))`),
  ]
);

export const chapterVariants = pgTable(
  "chapter_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "restrict" }),
    locale: varchar("locale", { length: 16 }).notNull().references(() => locales.code),
    register: registerEnum("register").default("standard").notNull(),
    publishedRevisionId: uuid("published_revision_id"),
    generation: integer("generation").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chapter_variants_unique").on(table.chapterId, table.locale, table.register),
    check("casual_locale_check", sql`"register" != 'casual' OR "locale" = 'id'`),
  ]
);

export const pricingTiers = pgTable(
  "pricing_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    amountIdr: bigint("amount_idr", { mode: "bigint" }).notNull(),
    status: tierStatusEnum("status").default("active").notNull(),
    version: integer("version").default(1).notNull(),
    termsVersion: varchar("terms_version", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("pricing_tiers_amount_idr_check", sql`"amount_idr" > 0`),
  ]
);

export const tierBooks = pgTable(
  "tier_books",
  {
    tierId: uuid("tier_id").notNull().references(() => pricingTiers.id, { onDelete: "restrict" }),
    bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.tierId, table.bookId] }),
  ]
);
