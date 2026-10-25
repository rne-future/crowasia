import { pgTable, timestamp, uuid, varchar, bigint, pgEnum } from "drizzle-orm/pg-core";
import { books, registerEnum } from "./catalog";
import { locales } from "./identity";

export const mediaKindEnum = pgEnum("media_kind", ["pdf", "cover", "poster"]);
export const mediaStatusEnum = pgEnum("media_status", ["pending", "ready", "failed"]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookId: uuid("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "restrict" }),
  edition: varchar("edition", { length: 32 }).notNull(),
  locale: varchar("locale", { length: 16 })
    .notNull()
    .references(() => locales.code),
  register: registerEnum("register").default("standard").notNull(),
  kind: mediaKindEnum("kind").notNull(),
  objectKey: varchar("object_key", { length: 255 }).notNull().unique(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  bytes: bigint("bytes", { mode: "bigint" }).notNull(),
  mime: varchar("mime", { length: 64 }).notNull(),
  status: mediaStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
