import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { reconcileOpenOrders } from "@/modules/payments/reconcile";
import { MayarClient } from "@/modules/payments/adapter";
import type { MayarInvoice, MayarTransaction } from "@/modules/payments/types";
import { GET as cronGetRoute, POST as cronPostRoute } from "@/app/api/cron/jobs/route";
import { env } from "@/shared/config/env";
import {
  TestDbHarness,
  seedStandardCatalog,
} from "../helpers/test-harness";

const { activeHarnessRef, mockMayarClientRef } = vi.hoisted(() => ({
  activeHarnessRef: { current: null as TestDbHarness | null },
  mockMayarClientRef: { current: null as unknown as MayarClient },
}));

vi.mock("@/shared/db/client", () => ({
  get db() {
    return activeHarnessRef.current?.getDb();
  },
}));

vi.mock("@/modules/payments/adapter", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/payments/adapter")>();
  return {
    ...mod,
    getMayarClient: () => mockMayarClientRef.current,
  };
});

vi.mock("@/modules/payments", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/payments")>();
  return {
    ...mod,
    getMayarClient: () => mockMayarClientRef.current,
  };
});

describe("ACC-16: Cron Reconciliation Worker Recovery (Integration)", () => {
  let harness: TestDbHarness;
  let catalog: ReturnType<typeof seedStandardCatalog>;
  let mockInvoices: Map<string, MayarInvoice>;
  let mockTransactions: Map<string, MayarTransaction>;

  const orderIdOld = "order-reconcile-old-001";
  const orderIdYoung = "order-reconcile-young-002";
  const orderIdCreateUnknown = "order-reconcile-cu-003";
  const orderIdExpired = "order-reconcile-exp-004";

  const buyerUserId = "user-reconcile-buyer-999";
  const buyerEmail = "reconcile.buyer@example.com";
  const payable = 299000n;

  beforeEach(() => {
    vi.restoreAllMocks();
    harness = new TestDbHarness();
    activeHarnessRef.current = harness;
    catalog = seedStandardCatalog(harness);

    mockInvoices = new Map();
    mockTransactions = new Map();

    const mockClient = {
      apiKey: "test_key",
      baseUrl: "https://api.mayar.io/hl/v2",
      environment: "sandbox",
      getInvoice: vi.fn().mockImplementation(async (id: string) => {
        const inv = mockInvoices.get(id);
        if (!inv) throw new Error(`Invoice not found: ${id}`);
        return inv;
      }),
      getTransaction: vi.fn().mockImplementation(async (id: string) => {
        const txn = mockTransactions.get(id);
        if (!txn) throw new Error(`Transaction not found: ${id}`);
        return txn;
      }),
      verifyPayment: vi.fn().mockImplementation(async (orderSnapshot, invoiceId) => {
        const inv = mockInvoices.get(invoiceId);
        if (!inv) throw new Error(`Invoice not found: ${invoiceId}`);
        const txn = inv.transactionId ? mockTransactions.get(inv.transactionId) : null;
        return {
          provider: "mayar",
          environment: "sandbox",
          merchantId: inv.userId ?? "merchant-primary",
          invoiceId: inv.id,
          transactionId: txn?.id ?? "txn-reconciled-default",
          orderId: orderSnapshot.orderId,
          payableIdr: orderSnapshot.payable,
          amount: orderSnapshot.payable,
          currency: "IDR",
          evidenceHash: "0".repeat(64),
          verifiedAt: new Date(),
          adapterContractVersion: "2.0",
        };
      }),
      createInvoice: vi.fn(),
    };

    mockMayarClientRef.current = mockClient as unknown as MayarClient;

    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

    // 1. Order older than 15m cutoff in AWAITING_PAYMENT (simulating lost webhook)
    harness.tables.orders.push({
      id: orderIdOld,
      buyerUserId,
      buyerEmail,
      buyerName: "Old Order Buyer",
      buyerMobile: "+6281234567890",
      status: "AWAITING_PAYMENT",
      currency: "IDR",
      subtotal: payable,
      discount: 0n,
      tax: 0n,
      payable,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-primary",
      invoiceId: "inv-mayar-old-001",
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: thirtyMinutesAgo,
      updatedAt: thirtyMinutesAgo,
    });

    // Seed 3 items for orderIdOld
    harness.tables.order_items.push(
      {
        id: "item-rec-old-1",
        orderId: orderIdOld,
        bookId: catalog.book1.id,
        bookTitleSnapshot: catalog.book1.title,
        offerIdSnapshot: "bundle-3-books",
        price: 100000n,
      },
      {
        id: "item-rec-old-2",
        orderId: orderIdOld,
        bookId: catalog.book2.id,
        bookTitleSnapshot: catalog.book2.title,
        offerIdSnapshot: "bundle-3-books",
        price: 100000n,
      },
      {
        id: "item-rec-old-3",
        orderId: orderIdOld,
        bookId: catalog.book3.id,
        bookTitleSnapshot: catalog.book3.title,
        offerIdSnapshot: "bundle-3-books",
        price: 99000n,
      }
    );

    mockInvoices.set("inv-mayar-old-001", {
      id: "inv-mayar-old-001",
      transactionId: "txn-mayar-old-001",
      amount: payable,
      status: "paid",
      link: "https://mayar.id/inv-mayar-old-001",
      paymentUrl: "https://mayar.id/inv-mayar-old-001",
      userId: "merchant-primary",
    });

    mockTransactions.set("txn-mayar-old-001", {
      id: "txn-mayar-old-001",
      amount: payable,
      status: "paid",
      userId: "merchant-primary",
    });

    // 2. Order younger than 15m cutoff in AWAITING_PAYMENT (5 min old)
    harness.tables.orders.push({
      id: orderIdYoung,
      buyerUserId: "user-young",
      buyerEmail: "young@example.com",
      buyerName: "Young Buyer",
      buyerMobile: "+6281234567890",
      status: "AWAITING_PAYMENT",
      currency: "IDR",
      subtotal: payable,
      discount: 0n,
      tax: 0n,
      payable,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-primary",
      invoiceId: "inv-mayar-young-002",
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: fiveMinutesAgo,
      updatedAt: fiveMinutesAgo,
    });

    mockInvoices.set("inv-mayar-young-002", {
      id: "inv-mayar-young-002",
      transactionId: "txn-mayar-young-002",
      amount: payable,
      status: "paid",
      link: "https://mayar.id/inv-mayar-young-002",
      paymentUrl: "https://mayar.id/inv-mayar-young-002",
      userId: "merchant-primary",
    });

    // 3. Order in CREATE_UNKNOWN older than cutoff
    harness.tables.orders.push({
      id: orderIdCreateUnknown,
      buyerUserId: "user-cu",
      buyerEmail: "cu@example.com",
      buyerName: "CU Buyer",
      buyerMobile: "+6281234567890",
      status: "CREATE_UNKNOWN",
      currency: "IDR",
      subtotal: 149000n,
      discount: 0n,
      tax: 0n,
      payable: 149000n,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-primary",
      invoiceId: "inv-mayar-cu-003",
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: thirtyMinutesAgo,
      updatedAt: thirtyMinutesAgo,
    });

    harness.tables.order_items.push({
      id: "item-rec-cu-1",
      orderId: orderIdCreateUnknown,
      bookId: catalog.book1.id,
      bookTitleSnapshot: catalog.book1.title,
      offerIdSnapshot: "single-book-1",
      price: 149000n,
    });

    mockInvoices.set("inv-mayar-cu-003", {
      id: "inv-mayar-cu-003",
      transactionId: "txn-mayar-cu-003",
      amount: 149000n,
      status: "paid",
      link: "https://mayar.id/inv-mayar-cu-003",
      paymentUrl: "https://mayar.id/inv-mayar-cu-003",
      userId: "merchant-primary",
    });

    mockTransactions.set("txn-mayar-cu-003", {
      id: "txn-mayar-cu-003",
      amount: 149000n,
      status: "paid",
      userId: "merchant-primary",
    });

    // 4. Order older than cutoff with upstream expired invoice
    harness.tables.orders.push({
      id: orderIdExpired,
      buyerUserId: "user-exp",
      buyerEmail: "exp@example.com",
      buyerName: "Expired Buyer",
      buyerMobile: "+6281234567890",
      status: "AWAITING_PAYMENT",
      currency: "IDR",
      subtotal: payable,
      discount: 0n,
      tax: 0n,
      payable,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-primary",
      invoiceId: "inv-mayar-exp-004",
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: thirtyMinutesAgo,
      updatedAt: thirtyMinutesAgo,
    });

    mockInvoices.set("inv-mayar-exp-004", {
      id: "inv-mayar-exp-004",
      transactionId: null,
      amount: payable,
      status: "expired",
      link: "https://mayar.id/inv-mayar-exp-004",
      paymentUrl: "https://mayar.id/inv-mayar-exp-004",
      userId: "merchant-primary",
    });
  });

  it("discovers pending orders older than cutoff, polls Mayar, verifies payment, and settles order automatically", async () => {
    // Run reconciliation worker
    const report = await reconcileOpenOrders({
      dbOrTx: harness.getDb(),
      client: mockMayarClientRef.current,
      minAgeMinutes: 15,
      maxBatchSize: 50,
    });

    // Report metrics
    // Should scan 3 orders older than cutoff (orderIdOld, orderIdCreateUnknown, orderIdExpired)
    // Should skip orderIdYoung (< 15 min old)
    expect(report.scannedCount).toBe(3);
    expect(report.settledCount).toBe(2); // orderIdOld and orderIdCreateUnknown
    expect(report.expiredCount).toBe(1); // orderIdExpired
    expect(report.errors).toHaveLength(0);

    // 1. Verify orderIdOld transitioned to PAID and buyer received grants
    const oldOrder = harness.tables.orders.find((o) => o.id === orderIdOld);
    expect(oldOrder?.status).toBe("PAID");
    expect(oldOrder?.paidAt).toBeInstanceOf(Date);
    expect(oldOrder?.transactionId).toBe("txn-mayar-old-001");

    const oldGrants = harness.tables.purchase_grants.filter(
      (g) => g.userId === buyerUserId
    );
    expect(oldGrants).toHaveLength(3); // All 3 bundle books granted

    // 2. Verify orderIdCreateUnknown transitioned to PAID and buyer received grants
    const cuOrder = harness.tables.orders.find((o) => o.id === orderIdCreateUnknown);
    expect(cuOrder?.status).toBe("PAID");
    expect(cuOrder?.paidAt).toBeInstanceOf(Date);

    const cuGrants = harness.tables.purchase_grants.filter(
      (g) => g.userId === "user-cu"
    );
    expect(cuGrants).toHaveLength(1);

    // 3. Verify orderIdYoung was untouched (< 15 min old)
    const youngOrder = harness.tables.orders.find((o) => o.id === orderIdYoung);
    expect(youngOrder?.status).toBe("AWAITING_PAYMENT");
    expect(youngOrder?.paidAt).toBeNull();

    // 4. Verify orderIdExpired transitioned to EXPIRED
    const expOrder = harness.tables.orders.find((o) => o.id === orderIdExpired);
    expect(expOrder?.status).toBe("EXPIRED");
  });

  it("transitions CREATE_UNKNOWN orders with null invoiceId older than cutoff to EXPIRED", async () => {
    const orderIdCuNull = "order-reconcile-cu-null";
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    harness.tables.orders.push({
      id: orderIdCuNull,
      buyerUserId: "user-cu-null",
      buyerEmail: "cu.null@example.com",
      buyerName: "CU Null Buyer",
      buyerMobile: "+6281234567890",
      status: "CREATE_UNKNOWN",
      currency: "IDR",
      subtotal: 100000n,
      discount: 0n,
      tax: 0n,
      payable: 100000n,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-primary",
      invoiceId: null,
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: thirtyMinutesAgo,
      updatedAt: thirtyMinutesAgo,
    });

    const report = await reconcileOpenOrders({
      dbOrTx: harness.getDb(),
      client: mockMayarClientRef.current,
      minAgeMinutes: 15,
    });

    const cuNullOrder = harness.tables.orders.find((o) => o.id === orderIdCuNull);
    expect(cuNullOrder?.status).toBe("EXPIRED");
    expect(report.expiredCount).toBeGreaterThanOrEqual(2);
  });

  it("verifies idempotency: running reconciliation a second time does not re-settle or duplicate grants", async () => {
    // First run
    await reconcileOpenOrders({
      dbOrTx: harness.getDb(),
      client: mockMayarClientRef.current,
      minAgeMinutes: 15,
    });

    const grantsCountFirst = harness.tables.purchase_grants.length;
    const vpCountFirst = harness.tables.verified_payments.length;

    // Second run
    const secondReport = await reconcileOpenOrders({
      dbOrTx: harness.getDb(),
      client: mockMayarClientRef.current,
      minAgeMinutes: 15,
    });

    // Candidate orders in AWAITING_PAYMENT / CREATE_UNKNOWN older than cutoff are now 0
    expect(secondReport.scannedCount).toBe(0);
    expect(secondReport.settledCount).toBe(0);

    // Zero duplicate grants or duplicate payments
    expect(harness.tables.purchase_grants.length).toBe(grantsCountFirst);
    expect(harness.tables.verified_payments.length).toBe(vpCountFirst);
  });

  describe("Cron API Route Integration (/api/cron/jobs)", () => {
    it("rejects unauthorized cron requests without valid CRON_SECRET", async () => {
      const request = new NextRequest("http://localhost:3000/api/cron/jobs", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-secret",
        },
      });

      const response = await cronPostRoute(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("accepts valid CRON_SECRET for GET (standard Vercel Cron) and executes reconciliation", async () => {
      const cronSecret = process.env.CRON_SECRET || env.CRON_SECRET || "cron_secret_test";
      process.env.CRON_SECRET = cronSecret;

      const request = new NextRequest("http://localhost:3000/api/cron/jobs", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const response = await cronGetRoute(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.reconcile).toBeDefined();
      expect(json.reconcile.scannedCount).toBe(3);
      expect(json.reconcile.settledCount).toBe(2);
      expect(json.reconcile.expiredCount).toBe(1);
    });

    it("accepts valid CRON_SECRET for POST and returns structured job metrics without PII", async () => {
      const cronSecret = process.env.CRON_SECRET || env.CRON_SECRET || "cron_secret_test";
      process.env.CRON_SECRET = cronSecret;

      const request = new NextRequest("http://localhost:3000/api/cron/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const response = await cronPostRoute(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(typeof json.durationMs).toBe("number");
      expect(json.inbox).toBeDefined();
      expect(json.outbox).toBeDefined();
      expect(json.reconcile).toBeDefined();

      // Verify no PII (email, mobile, name) in cron response
      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain("buyer@example.com");
      expect(serialized).not.toContain("+628");
    });
  });
});
