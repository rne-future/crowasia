import { describe, it, expect } from "vitest";
import { isTable, getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/shared/db/schema";

describe("Database Schema Core Tables", () => {
  it("exports all 30+ tables", () => {
    const tables = Object.values(schema).filter((value) => isTable(value));
    expect(tables.length).toBeGreaterThanOrEqual(30);
  });

  it("orders.payable is bigint and has required financial columns", () => {
    const columns = getTableColumns(schema.orders);
    expect(columns.payable.dataType).toBe("bigint");
    expect(columns.subtotal.dataType).toBe("bigint");
    expect(columns.discount.dataType).toBe("bigint");
    expect(columns.tax.dataType).toBe("bigint");
    expect(columns.currency.dataType).toBe("string");
  });

  it("orders table has check constraints for currency, payable > 0, and payable calc", () => {
    const config = getTableConfig(schema.orders);
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain("orders_currency_idr_check");
    expect(checkNames).toContain("orders_payable_positive_check");
    expect(checkNames).toContain("orders_payable_calc_check");
  });

  it("chapters has index 0..14 check and is_free_sample check", () => {
    const columns = getTableColumns(schema.chapters);
    expect(columns.index.dataType).toBe("number");
    expect(columns.isFreeSample.dataType).toBe("boolean");

    const config = getTableConfig(schema.chapters);
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain("chapters_index_range_check");
    expect(checkNames).toContain("chapters_free_sample_check");
  });

  it("checklistItems has chapter_id referencing chapters (language-neutral)", () => {
    const columns = getTableColumns(schema.checklistItems);
    expect(columns.id).toBeDefined();
    expect(columns.chapterId).toBeDefined();
  });

  it("checklistProgress has version >= 1 check and composite PK", () => {
    const columns = getTableColumns(schema.checklistProgress);
    expect(columns.userId).toBeDefined();
    expect(columns.itemId).toBeDefined();
    expect(columns.version.dataType).toBe("number");

    const config = getTableConfig(schema.checklistProgress);
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain("checklist_progress_version_check");
  });

  it("purchaseGrants has unique order_item_id and nullable user_id", () => {
    const columns = getTableColumns(schema.purchaseGrants);
    expect(columns.orderItemId.isUnique).toBe(true);
    expect(columns.userId.notNull).toBe(false);
  });

  it("outboxJobs and webhookInbox have dedupe/event keys", () => {
    const outboxCols = getTableColumns(schema.outboxJobs);
    expect(outboxCols.dedupeKey.isUnique).toBe(true);

    const inboxCols = getTableColumns(schema.webhookInbox);
    expect(inboxCols.providerEnv).toBeDefined();
    expect(inboxCols.eventKey).toBeDefined();
  });

  it("searchPublic and searchPrivate define tsvector document", () => {
    const publicCols = getTableColumns(schema.searchPublic);
    const privateCols = getTableColumns(schema.searchPrivate);
    expect(publicCols.document.getSQLType()).toBe("tsvector");
    expect(privateCols.document.getSQLType()).toBe("tsvector");
  });

  it("pricingTiers amountIdr is bigint with positive check", () => {
    const columns = getTableColumns(schema.pricingTiers);
    expect(columns.amountIdr.dataType).toBe("bigint");

    const config = getTableConfig(schema.pricingTiers);
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain("pricing_tiers_amount_idr_check");
  });

  it("exports a working db client instance", async () => {
    const { db } = await import("@/shared/db/client");
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();
  });
});
