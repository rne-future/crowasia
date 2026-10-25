import { describe, it, expect, vi, beforeEach } from "vitest";
import { settleVerifiedPayment } from "@/modules/commerce/settle";
import { processMayarWebhookEvent } from "@/modules/payments/inbox-handler";
import type { VerifiedPaymentData } from "@/modules/payments/types";
import {
  AmountMismatchError,
  PaymentVerificationError,
} from "@/modules/payments/types";
import { OrderNotFoundError } from "@/modules/commerce/types";
import { orders, orderItems, verifiedPayments, purchaseGrants } from "@/shared/db/schema/commerce";
import { outboxJobs } from "@/shared/db/schema/jobs";
import type { WebhookInboxRow } from "@/shared/jobs/types";

describe("Settlement Coordinator & Atomic Entitlements (TDD)", () => {
  const orderId = "order-1111-1111-1111-111111111111";
  const buyerUserId = "user-2222-2222-2222-222222222222";
  const buyerEmail = "buyer@example.com";
  const invoiceId = "inv-mayar-999";
  const transactionId = "txn-mayar-888";
  const amount = 299000n;

  const validVerifiedPayment: VerifiedPaymentData = {
    provider: "mayar",
    environment: "sandbox",
    merchantId: "merchant-001",
    invoiceId,
    transactionId,
    payableIdr: amount,
    amount,
    currency: "IDR",
    evidenceHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    verifiedAt: new Date("2026-10-25T11:00:00.000Z"),
    adapterContractVersion: "2.0",
  };

  const bundleOrder = {
    id: orderId,
    buyerUserId,
    buyerEmail,
    buyerName: "John Buyer",
    buyerMobile: "+6281234567890",
    status: "AWAITING_PAYMENT",
    currency: "IDR",
    subtotal: 299000n,
    discount: 0n,
    tax: 0n,
    payable: 299000n,
    termsVersion: "2026-10-25",
    providerEnv: "sandbox",
    merchantId: "merchant-001",
    invoiceId,
    transactionId: null as string | null,
    paidAt: null as Date | null,
    createdAt: new Date("2026-10-25T10:00:00.000Z"),
    updatedAt: new Date("2026-10-25T10:00:00.000Z"),
  };

  const bundleItems = [
    {
      id: "item-1",
      orderId,
      bookId: "book-1",
      bookTitleSnapshot: "Mahir Memimpin Tim",
      offerIdSnapshot: "bundle-3-books",
      price: 100000n,
    },
    {
      id: "item-2",
      orderId,
      bookId: "book-2",
      bookTitleSnapshot: "Napas Panjang",
      offerIdSnapshot: "bundle-3-books",
      price: 100000n,
    },
    {
      id: "item-3",
      orderId,
      bookId: "book-3",
      bookTitleSnapshot: "Buku Ketiga",
      offerIdSnapshot: "bundle-3-books",
      price: 99000n,
    },
  ];

  let mockOrders: any[];
  let mockOrderItems: any[];
  let mockVerifiedPayments: any[];
  let mockPurchaseGrants: any[];
  let mockOutboxJobs: any[];
  let mockDb: any;
  let lockForUpdateCalled = false;

  beforeEach(() => {
    vi.clearAllMocks();
    lockForUpdateCalled = false;

    mockOrders = [{ ...bundleOrder }];
    mockOrderItems = [...bundleItems];
    mockVerifiedPayments = [];
    mockPurchaseGrants = [];
    mockOutboxJobs = [];

    mockDb = {
      select: vi.fn().mockImplementation((_fields?: any) => ({
        from: vi.fn().mockImplementation((table: any) => {
          const queryObj: any = {
            where: vi.fn().mockImplementation((_condition: any) => {
              const resObj: any = {
                for: vi.fn().mockImplementation((lockMode: string) => {
                  if (lockMode === "update") {
                    lockForUpdateCalled = true;
                  }
                  if (table === orders) {
                    return Promise.resolve(mockOrders);
                  }
                  return Promise.resolve([]);
                }),
                limit: vi.fn().mockImplementation((_n: number) => {
                  if (table === orders) return Promise.resolve(mockOrders.slice(0, 1));
                  if (table === verifiedPayments) return Promise.resolve(mockVerifiedPayments.slice(0, 1));
                  return Promise.resolve([]);
                }),
              };

              // Make query thenable
              resObj.then = (resolve: any) => {
                if (table === orders) {
                  return resolve(mockOrders);
                }
                if (table === orderItems) {
                  return resolve(mockOrderItems);
                }
                if (table === verifiedPayments) {
                  return resolve(mockVerifiedPayments);
                }
                if (table === purchaseGrants) {
                  return resolve(mockPurchaseGrants);
                }
                return resolve([]);
              };

              return resObj;
            }),
          };
          return queryObj;
        }),
      })),
      insert: vi.fn().mockImplementation((table: any) => ({
        values: vi.fn().mockImplementation((vals: any) => {
          const inserted = {
            id: vals.id ?? `id-${Math.random().toString(36).slice(2, 7)}`,
            ...vals,
            createdAt: vals.createdAt ?? new Date(),
          };
          if (table === verifiedPayments) {
            mockVerifiedPayments.push(inserted);
          } else if (table === purchaseGrants) {
            mockPurchaseGrants.push(inserted);
          } else if (table === outboxJobs) {
            mockOutboxJobs.push(inserted);
          }
          return {
            onConflictDoNothing: vi.fn().mockResolvedValue([inserted]),
            returning: vi.fn().mockResolvedValue([inserted]),
            then: (resolve: any) => resolve([inserted]),
          };
        }),
      })),
      update: vi.fn().mockImplementation((table: any) => ({
        set: vi.fn().mockImplementation((patch: any) => ({
          where: vi.fn().mockImplementation(() => {
            if (table === orders && mockOrders.length > 0) {
              Object.assign(mockOrders[0], patch);
            }
            return Promise.resolve([mockOrders[0]]);
          }),
        })),
      })),
      transaction: vi.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb);
      }),
    };
  });

  describe("settleVerifiedPayment", () => {
    it("locks order row FOR UPDATE and atomically settles payment with 3 book grants for bundle", async () => {
      const result = await settleVerifiedPayment(validVerifiedPayment, mockDb);

      expect(lockForUpdateCalled).toBe(true);
      expect(result.settled).toBe(true);
      expect(result.orderId).toBe(orderId);
      expect(result.grantsCount).toBe(3);

      // Verify verified_payments row
      expect(mockVerifiedPayments).toHaveLength(1);
      const vp = mockVerifiedPayments[0];
      expect(vp.orderId).toBe(orderId);
      expect(vp.transactionId).toBe(transactionId);
      expect(vp.invoiceId).toBe(invoiceId);
      expect(vp.amount).toBe(amount);
      expect(vp.evidenceHash).toBe(validVerifiedPayment.evidenceHash);

      // Verify purchase_grants created for all 3 books
      expect(mockPurchaseGrants).toHaveLength(3);
      expect(mockPurchaseGrants[0].orderItemId).toBe("item-1");
      expect(mockPurchaseGrants[0].bookId).toBe("book-1");
      expect(mockPurchaseGrants[0].userId).toBe(buyerUserId);
      expect(mockPurchaseGrants[1].bookId).toBe("book-2");
      expect(mockPurchaseGrants[2].bookId).toBe("book-3");

      // Verify order status updated to PAID
      expect(mockOrders[0].status).toBe("PAID");
      expect(mockOrders[0].transactionId).toBe(transactionId);
      expect(mockOrders[0].paidAt).toBeInstanceOf(Date);

      // Verify outbox job enqueued
      expect(mockOutboxJobs).toHaveLength(1);
      const job = mockOutboxJobs[0];
      expect(job.kind).toBe("order_settled");
      expect(job.aggregateId).toBe(orderId);
      expect(job.dedupeKey).toBe(`order-settled-${orderId}`);
      expect(job.payloadJson).toMatchObject({
        orderId,
        buyerEmail,
        buyerUserId,
        books: ["book-1", "book-2", "book-3"],
      });
    });

    it("settles CREATE_UNKNOWN order successfully", async () => {
      mockOrders[0].status = "CREATE_UNKNOWN";

      const result = await settleVerifiedPayment(validVerifiedPayment, mockDb);

      expect(result.settled).toBe(true);
      expect(mockOrders[0].status).toBe("PAID");
      expect(mockPurchaseGrants).toHaveLength(3);
    });

    it("settles EXPIRED order (late paid per spec)", async () => {
      mockOrders[0].status = "EXPIRED";

      const result = await settleVerifiedPayment(validVerifiedPayment, mockDb);

      expect(result.settled).toBe(true);
      expect(mockOrders[0].status).toBe("PAID");
    });

    it("idempotently handles duplicate call with the same transactionId", async () => {
      // First settlement
      await settleVerifiedPayment(validVerifiedPayment, mockDb);
      expect(mockPurchaseGrants).toHaveLength(3);
      expect(mockVerifiedPayments).toHaveLength(1);
      expect(mockOutboxJobs).toHaveLength(1);

      // Second duplicate settlement
      const secondResult = await settleVerifiedPayment(validVerifiedPayment, mockDb);

      expect(secondResult.settled).toBe(true);
      expect(secondResult.alreadySettled).toBe(true);
      expect(secondResult.orderId).toBe(orderId);

      // Must not add extra grants or verified payments or outbox jobs
      expect(mockPurchaseGrants).toHaveLength(3);
      expect(mockVerifiedPayments).toHaveLength(1);
      expect(mockOutboxJobs).toHaveLength(1);
    });

    it("throws PaymentVerificationError if order is already paid by a different transactionId", async () => {
      mockOrders[0].status = "PAID";
      mockOrders[0].transactionId = "other-txn-999";

      await expect(
        settleVerifiedPayment(validVerifiedPayment, mockDb)
      ).rejects.toThrow(PaymentVerificationError);
    });

    it("throws PaymentVerificationError if order is in terminal CANCELLED or FAILED status", async () => {
      mockOrders[0].status = "CANCELLED";

      await expect(
        settleVerifiedPayment(validVerifiedPayment, mockDb)
      ).rejects.toThrow(PaymentVerificationError);

      mockOrders[0].status = "FAILED";

      await expect(
        settleVerifiedPayment(validVerifiedPayment, mockDb)
      ).rejects.toThrow(PaymentVerificationError);
    });

    it("throws AmountMismatchError and aborts if payment amount does not match order payable", async () => {
      const mismatchedPayment: VerifiedPaymentData = {
        ...validVerifiedPayment,
        amount: 299001n, // mismatch +1 IDR
      };

      await expect(
        settleVerifiedPayment(mismatchedPayment, mockDb)
      ).rejects.toThrow(AmountMismatchError);

      // Order status remains untouched
      expect(mockOrders[0].status).toBe("AWAITING_PAYMENT");
      expect(mockPurchaseGrants).toHaveLength(0);
      expect(mockVerifiedPayments).toHaveLength(0);
    });

    it("throws OrderNotFoundError if order cannot be found by invoice or orderId", async () => {
      mockOrders = [];

      await expect(
        settleVerifiedPayment(validVerifiedPayment, mockDb)
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("settles guest purchase correctly with userId null on grants", async () => {
      mockOrders[0].buyerUserId = null;

      const result = await settleVerifiedPayment(validVerifiedPayment, mockDb);

      expect(result.settled).toBe(true);
      expect(mockPurchaseGrants).toHaveLength(3);
      expect(mockPurchaseGrants[0].userId).toBeNull();
      expect(mockPurchaseGrants[1].userId).toBeNull();
      expect(mockPurchaseGrants[2].userId).toBeNull();
    });

    it("rolls back all changes atomically if an error occurs during grant creation", async () => {
      let transactionRolledBack = false;
      const failingDb = {
        ...mockDb,
        insert: vi.fn().mockImplementation((table: any) => {
          if (table === purchaseGrants) {
            throw new Error("DB_GRANT_INSERT_FAILURE");
          }
          return mockDb.insert(table);
        }),
        transaction: vi.fn().mockImplementation(async (cb: any) => {
          try {
            return await cb(failingDb);
          } catch (e) {
            transactionRolledBack = true;
            throw e;
          }
        }),
      };

      await expect(
        settleVerifiedPayment(validVerifiedPayment, failingDb)
      ).rejects.toThrow("DB_GRANT_INSERT_FAILURE");

      expect(transactionRolledBack).toBe(true);
    });
  });

  describe("processMayarWebhookEvent", () => {
    it("parses normalized webhook event, verifies with Mayar client, and settles order", async () => {
      const inboxRow: WebhookInboxRow = {
        id: "inbox-row-1",
        providerEnv: "mayar_sandbox",
        eventKey: "evt_123",
        payloadHash: "hash123",
        normalizedJson: {
          event: "payment.received",
          data: {
            id: invoiceId,
            transactionId,
            amount: 299000,
            status: "paid",
          },
        },
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        errorCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMayarClient = {
        verifyPayment: vi.fn().mockResolvedValue(validVerifiedPayment),
      };

      await processMayarWebhookEvent(inboxRow, mockDb, mockMayarClient as any);

      expect(mockMayarClient.verifyPayment).toHaveBeenCalledTimes(1);
      expect(mockOrders[0].status).toBe("PAID");
      expect(mockPurchaseGrants).toHaveLength(3);
      expect(mockOutboxJobs).toHaveLength(1);
    });

    it("handles idempotent webhook event when order is already settled", async () => {
      mockOrders[0].status = "PAID";
      mockOrders[0].transactionId = transactionId;

      const inboxRow: WebhookInboxRow = {
        id: "inbox-row-dup",
        providerEnv: "mayar_sandbox",
        eventKey: "evt_123_dup",
        payloadHash: "hash123",
        normalizedJson: {
          event: "payment.received",
          data: {
            id: invoiceId,
            transactionId,
            amount: 299000,
            status: "paid",
          },
        },
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        errorCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMayarClient = {
        verifyPayment: vi.fn().mockResolvedValue(validVerifiedPayment),
      };

      await expect(
        processMayarWebhookEvent(inboxRow, mockDb, mockMayarClient as any)
      ).resolves.not.toThrow();
    });
  });
});
