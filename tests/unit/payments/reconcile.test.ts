import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reconcileOpenOrders,
  type ReconciliationReport,
} from "@/modules/payments/reconcile";
import { orders } from "@/shared/db/schema/commerce";
import type { MayarInvoice, VerifiedPaymentData } from "@/modules/payments/types";
import { GET as cronGetRoute, POST as cronPostRoute } from "@/app/api/cron/jobs/route";

const { mockOrders, mockDb } = vi.hoisted(() => {
  const mOrders: any[] = [];
  const db: any = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation((condition: any) => {
          const queryObj: any = {
            orderBy: vi.fn().mockImplementation(() => queryObj),
            limit: vi.fn().mockImplementation((limitCount: number) => {
              const now = Date.now();
              const filtered = mOrders.filter(
                (o) => now - o.createdAt.getTime() >= 5 * 60 * 1000
              );
              return Promise.resolve(filtered.slice(0, limitCount));
            }),
          };
          queryObj.then = (resolve: any) => {
            const now = Date.now();
            const filtered = mOrders.filter(
              (o) => now - o.createdAt.getTime() >= 5 * 60 * 1000
            );
            return resolve(filtered);
          };
          return queryObj;
        }),
      })),
    })),
    update: vi.fn().mockImplementation((table: any) => ({
      set: vi.fn().mockImplementation((setVals: any) => ({
        where: vi.fn().mockImplementation((_condition: any) => {
          return Promise.resolve();
        }),
      })),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      })),
    })),
    transaction: vi.fn().mockImplementation(async (cb: any) => cb(db)),
  };

  return {
    mockOrders: mOrders,
    mockDb: db,
  };
});

vi.mock("@/shared/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/shared/jobs/process-inbox", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    runInboxWorker: vi.fn().mockResolvedValue({
      claimed: 0,
      processed: 0,
      retried: 0,
      dead: 0,
      oldestPendingAgeMs: null,
    }),
  };
});


vi.mock("@/shared/jobs/process-outbox", () => ({
  runOutboxWorker: vi.fn().mockResolvedValue({
    claimed: 0,
    processed: 0,
    retried: 0,
    dead: 0,
    oldestPendingAgeMs: null,
  }),
}));

describe("Payment Reconciliation (TDD)", () => {
  const orderIdPaid = "order-paid-1111";
  const orderIdExpired = "order-exp-2222";
  const orderIdPending = "order-pend-3333";
  const orderIdRecent = "order-recent-4444";

  let mockMayarClient: any;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-123";

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    mockOrders.length = 0;
    mockOrders.push(
      {
        id: orderIdPaid,
        buyerUserId: null,
        buyerEmail: "paid@example.com",
        buyerName: "Paid Buyer",
        buyerMobile: "+6281111111",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 100000n,
        discount: 0n,
        tax: 0n,
        payable: 100000n,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-001",
        invoiceId: "inv-paid-1111",
        transactionId: null,
        paidAt: null,
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      },
      {
        id: orderIdExpired,
        buyerUserId: null,
        buyerEmail: "expired@example.com",
        buyerName: "Expired Buyer",
        buyerMobile: "+6282222222",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 100000n,
        discount: 0n,
        tax: 0n,
        payable: 100000n,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-001",
        invoiceId: "inv-exp-2222",
        transactionId: null,
        paidAt: null,
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      },
      {
        id: orderIdPending,
        buyerUserId: null,
        buyerEmail: "pending@example.com",
        buyerName: "Pending Buyer",
        buyerMobile: "+6283333333",
        status: "CREATE_UNKNOWN",
        currency: "IDR",
        subtotal: 100000n,
        discount: 0n,
        tax: 0n,
        payable: 100000n,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-001",
        invoiceId: "inv-pend-3333",
        transactionId: null,
        paidAt: null,
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      },
      {
        id: orderIdRecent,
        buyerUserId: null,
        buyerEmail: "recent@example.com",
        buyerName: "Recent Buyer",
        buyerMobile: "+6284444444",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 100000n,
        discount: 0n,
        tax: 0n,
        payable: 100000n,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-001",
        invoiceId: "inv-recent-4444",
        transactionId: null,
        paidAt: null,
        createdAt: twoMinutesAgo,
        updatedAt: twoMinutesAgo,
      }
    );

    mockMayarClient = {
      environment: "sandbox",
      getInvoice: vi.fn().mockImplementation(async (invoiceId: string): Promise<MayarInvoice> => {
        if (invoiceId === "inv-paid-1111") {
          return {
            id: "inv-paid-1111",
            transactionId: "txn-paid-1111",
            amount: 100000n,
            status: "paid",
            link: "https://mayar.link/inv-paid",
          };
        }
        if (invoiceId === "inv-exp-2222") {
          return {
            id: "inv-exp-2222",
            transactionId: null,
            amount: 100000n,
            status: "expired",
            link: "https://mayar.link/inv-exp",
          };
        }
        if (invoiceId === "inv-pend-3333") {
          return {
            id: "inv-pend-3333",
            transactionId: null,
            amount: 100000n,
            status: "unpaid",
            link: "https://mayar.link/inv-pend",
          };
        }
        throw new Error(`Invoice ${invoiceId} not found`);
      }),
      verifyPayment: vi.fn().mockImplementation(
        async (snapshot: any, invoiceId: string): Promise<VerifiedPaymentData> => {
          return {
            provider: "mayar",
            environment: "sandbox",
            merchantId: "merchant-001",
            invoiceId,
            transactionId: `txn-${invoiceId}`,
            orderId: snapshot.orderId,
            payableIdr: snapshot.payable,
            amount: snapshot.payable,
            currency: "IDR",
            evidenceHash: "mock-evidence-hash",
            verifiedAt: new Date(),
            adapterContractVersion: "2.0",
          };
        }
      ),
    };
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  describe("reconcileOpenOrders", () => {
    it("scans open orders older than 5 minutes and settles paid invoices", async () => {
      const settleSpy = vi.fn().mockResolvedValue({
        settled: true,
        orderId: orderIdPaid,
        grantsCount: 1,
      });

      const report = await reconcileOpenOrders({
        maxBatchSize: 50,
        dbOrTx: mockDb,
        client: mockMayarClient,
        minAgeMinutes: 5,
        settler: settleSpy,
      });

      expect(report.scannedCount).toBe(3); // 3 orders older than 5m
      expect(report.settledCount).toBe(1);
      expect(report.expiredCount).toBe(1);
      expect(report.errors).toEqual([]);

      expect(settleSpy).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalledWith(orders);
    });

    it("resiliently records errors and continues reconciling remaining orders when Mayar fails for one", async () => {
      mockMayarClient.getInvoice = vi
        .fn()
        .mockRejectedValueOnce(new Error("Mayar gateway timeout"))
        .mockResolvedValueOnce({
          id: "inv-exp-2222",
          transactionId: null,
          amount: 100000n,
          status: "expired",
          link: "https://mayar.link/inv-exp",
        })
        .mockResolvedValueOnce({
          id: "inv-pend-3333",
          transactionId: null,
          amount: 100000n,
          status: "unpaid",
          link: "https://mayar.link/inv-pend",
        });

      const report = await reconcileOpenOrders({
        maxBatchSize: 50,
        dbOrTx: mockDb,
        client: mockMayarClient,
        minAgeMinutes: 5,
      });

      expect(report.scannedCount).toBe(3);
      expect(report.settledCount).toBe(0);
      expect(report.expiredCount).toBe(1);
      expect(report.errors.length).toBe(1);
      expect(report.errors[0]).toContain("Mayar gateway timeout");
    });
  });

  describe("Cron Route Integration", () => {
    it("runs reconciliation as part of cron jobs route execution", async () => {
      const request = new Request("http://localhost:3000/api/cron/jobs", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret-123",
        },
      });

      const response = await cronPostRoute(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.reconcile).toBeDefined();
      expect(typeof json.reconcile.scannedCount).toBe("number");
      expect(typeof json.reconcile.settledCount).toBe("number");
      expect(typeof json.reconcile.expiredCount).toBe("number");
    });
  });
});
