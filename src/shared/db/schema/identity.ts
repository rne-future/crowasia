import { pgTable, text, timestamp, uuid, varchar, boolean, jsonb, pgEnum, primaryKey, foreignKey } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["reader", "editor", "publisher", "admin"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  preferencesJson: jsonb("preferences_json").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull(),
    role: userRoleEnum("role").notNull(),
    assignedBy: uuid("assigned_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
  ]
);

export const locales = pgTable(
  "locales",
  {
    code: varchar("code", { length: 16 }).primaryKey(),
    enabled: boolean("enabled").default(true).notNull(),
    direction: varchar("direction", { length: 3 }).default("ltr").notNull(),
    fallbackCode: varchar("fallback_code", { length: 16 }),
  },
  (table) => [
    foreignKey({
      columns: [table.fallbackCode],
      foreignColumns: [table.code],
    }),
  ]
);
