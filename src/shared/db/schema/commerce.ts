import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar, boolean, bigint, pgEnum, primaryKey, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { books } from "./catalog";

export const orderStatusEnum = pgEnum("order_status", ["pending", "paid", "expired", "failed", "cancelled"]);
export const refundStatusEnum = pgEnum("refund_status", ["none", "partial", "full", "review"]);
export const refundRecordStatusEnum = pgEnum("refund_record_status", ["pending", "confirmed", "failed"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerUserId: uuid("buyer_user_id"),
    buyerEmail: varchar("buyer_email", { length: 255 }).notNull(),
    buyerName: varchar("buyer_name", { length: 255 }).notNull(),
    buyerMobile: varchar("buyer_mobile", { length: 32 }).notNull(),
    status: orderStatusEnum("status").default("pending").notNull(),
    currency: varchar("currency", { length: 3 }).default("IDR").notNull(),
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    discount: bigint("discount", { mode: "bigint" }).default(sql`0`).notNull(),
    tax: bigint("tax", { mode: "bigint" }).default(sql`0`).notNull(),
    payable: bigint("payable", { mode: "bigint" }).notNull(),
    termsVersion: varchar("terms_version", { length: 32 }).notNull(),
    providerEnv: varchar("provider_env", { length: 32 }).notNull(),
    merchantId: varchar("merchant_id", { length: 128 }).notNull(),
    invoiceId: varchar("invoice_id", { length: 128 }),
    transactionId: varchar("transaction_id", { length: 128 }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    refundStatus: refundStatusEnum("refund_status").default("none").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("orders_currency_idr_check", sql`"currency" = 'IDR'`),
    check("orders_payable_positive_check", sql`"payable" > 0`),
    check("orders_payable_calc_check", sql`"payable" = "subtotal" - "discount" + "tax"`),
    uniqueIndex("orders_provider_merchant_invoice_unique")
      .on(table.providerEnv, table.merchantId, table.invoiceId)
      .where(sql`"invoice_id" IS NOT NULL`),
    index("orders_status_created_idx").on(table.status, table.createdAt),
    index("orders_buyer_user_created_idx").on(table.buyerUserId, table.createdAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    bookTitleSnapshot: text("book_title_snapshot").notNull(),
    offerIdSnapshot: varchar("offer_id_snapshot", { length: 64 }).notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
  },
  (table) => [
    uniqueIndex("order_items_order_book_unique").on(table.orderId, table.bookId),
  ]
);

export const checkoutRequests = pgTable(
  "checkout_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorScopeHash: varchar("actor_scope_hash", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("checkout_requests_actor_idempotency_unique").on(table.actorScopeHash, table.idempotencyKey),
  ]
);

export const verifiedPayments = pgTable(
  "verified_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    providerEnv: varchar("provider_env", { length: 32 }).notNull(),
    merchantId: varchar("merchant_id", { length: 128 }).notNull(),
    transactionId: varchar("transaction_id", { length: 128 }).notNull(),
    invoiceId: varchar("invoice_id", { length: 128 }).notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("verified_payments_provider_merchant_txn_unique").on(
      table.providerEnv,
      table.merchantId,
      table.transactionId
    ),
  ]
);

export const purchaseGrants = pgTable(
  "purchase_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .unique()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    userId: uuid("user_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    revokeReason: text("revoke_reason"),
  },
  (table) => [
    index("purchase_grants_user_book_active_idx")
      .on(table.userId, table.bookId)
      .where(sql`"revoked_at" IS NULL`),
  ]
);

export const manualGrants = pgTable(
  "manual_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("manual_grants_user_book_expires_idx").on(table.userId, table.bookId, table.expiresAt),
  ]
);

export const purchaseClaims = pgTable("purchase_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  claimedBy: uuid("claimed_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const refundRecords = pgTable(
  "refund_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    providerReference: varchar("provider_reference", { length: 128 }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    status: refundRecordStatusEnum("status").default("pending").notNull(),
    reason: text("reason").notNull(),
    recordedBy: uuid("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("refund_records_amount_positive_check", sql`"amount" > 0`),
  ]
);

export const refundItems = pgTable(
  "refund_items",
  {
    refundId: uuid("refund_id")
      .notNull()
      .references(() => refundRecords.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    revokeAccess: boolean("revoke_access").default(true).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.refundId, table.orderItemId] }),
  ]
);
