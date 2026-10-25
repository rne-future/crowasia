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

  function filterOrders(ordersList: any[], condition: any) {
    let cutoffDate: Date | null = null;
    const allowedStatuses = ["AWAITING_PAYMENT", "CREATE_UNKNOWN", "pending"];

    function findDate(obj: any): Date | null {
      if (!obj) return null;
      if (obj instanceof Date) return obj;
      if (obj.value instanceof Date) return obj.value;
      if (Array.isArray(obj.queryChunks)) {
        for (const c of obj.queryChunks) {
          const res = findDate(c);
          if (res) return res;
        }
      }
      return null;
    }
    cutoffDate = findDate(condition);

    return ordersList.filter((o) => {
      if (!allowedStatuses.includes(o.status)) return false;
      if (cutoffDate && o.createdAt > cutoffDate) return false;
      return true;
    });
  }

  const db: any = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation((condition: any) => {
          const queryObj: any = {
            orderBy: vi.fn().mockImplementation(() => queryObj),
            limit: vi.fn().mockImplementation((limitCount: number) => {
              const filtered = filterOrders(mOrders, condition);
              return Promise.resolve(filtered.slice(0, limitCount));
            }),
          };
          queryObj.then = (resolve: any) => {
            const filtered = filterOrders(mOrders, condition);
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

vi.mock("@/modules/payments/adapter", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getMayarClient: vi.fn().mockImplementation(() => ({
      environment: "sandbox",
      getInvoice: vi.fn().mockResolvedValue({
        id: "mock-inv",
        status: "unpaid",
      }),
      verifyPayment: vi.fn(),
    })),
  };
});

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

    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
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
        createdAt: twentyMinutesAgo,
        updatedAt: twentyMinutesAgo,
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
        createdAt: twentyMinutesAgo,
        updatedAt: twentyMinutesAgo,
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
        createdAt: twentyMinutesAgo,
        updatedAt: twentyMinutesAgo,
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
    it("scans open orders older than 15 minutes by default and settles paid invoices", async () => {
      const settleSpy = vi.fn().mockResolvedValue({
        settled: true,
        orderId: orderIdPaid,
        grantsCount: 1,
      });

      const report = await reconcileOpenOrders({
        maxBatchSize: 50,
        dbOrTx: mockDb,
        client: mockMayarClient,
        settler: settleSpy,
      });

      expect(report.scannedCount).toBe(3); // 3 orders older than 15m (recent order skipped)
      expect(report.settledCount).toBe(1);
      expect(report.expiredCount).toBe(1);
      expect(report.errors).toEqual([]);

      expect(settleSpy).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalledWith(orders);
    });

    it("scans all open orders including recent ones when minAgeMinutes is 0", async () => {
      const settleSpy = vi.fn().mockResolvedValue({
        settled: true,
        orderId: orderIdPaid,
        grantsCount: 1,
      });

      mockMayarClient.getInvoice.mockImplementation(async (id: string) => ({
        id,
        transactionId: null,
        amount: 100000n,
        status: "unpaid",
        link: "https://mayar.link/inv",
      }));

      const report = await reconcileOpenOrders({
        maxBatchSize: 50,
        dbOrTx: mockDb,
        client: mockMayarClient,
        minAgeMinutes: 0,
        settler: settleSpy,
      });

      // When minAgeMinutes is 0, recent order is not filtered by age cutoff
      expect(report.scannedCount).toBe(4);
    });

    it("does not scan EXPIRED orders avoiding batch starvation", async () => {
      // Simulate 50 expired orders that should be excluded from candidate query
      for (let i = 0; i < 50; i++) {
        mockOrders.unshift({
          id: `order-already-expired-${i}`,
          buyerUserId: null,
          buyerEmail: `exp${i}@example.com`,
          buyerName: "Expired",
          buyerMobile: "+628111",
          status: "EXPIRED",
          currency: "IDR",
          subtotal: 100000n,
          discount: 0n,
          tax: 0n,
          payable: 100000n,
          termsVersion: "2026-10-25",
          providerEnv: "sandbox",
          merchantId: "merchant-001",
          invoiceId: `inv-already-expired-${i}`,
          transactionId: null,
          paidAt: null,
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        });
      }

      const report = await reconcileOpenOrders({
        maxBatchSize: 50,
        dbOrTx: mockDb,
        client: mockMayarClient,
        minAgeMinutes: 15,
      });

      // Only the 3 unfinalized orders older than 15m should be scanned, not the 50 EXPIRED orders
      expect(report.scannedCount).toBe(3);
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
        minAgeMinutes: 15,
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
