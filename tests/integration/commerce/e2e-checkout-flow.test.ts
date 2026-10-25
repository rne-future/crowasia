import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createCheckoutOrder,
  settleVerifiedPayment,
  ConflictError,
  type CheckoutInput,
} from "@/modules/commerce";
import {
  requestPurchaseClaim,
  claimPurchase,
} from "@/modules/entitlements/claim";
import { canReadChapter } from "@/modules/entitlements/grants";
import { getChapterForReading } from "@/modules/reading/access-guard";
import {
  AmountMismatchError,
  PaymentVerificationError,
  MayarApiError,
  type VerifiedPaymentData,
  type OrderSnapshot,
} from "@/modules/payments/types";
import { MayarClient } from "@/modules/payments/adapter";
import type { Actor } from "@/modules/identity/types";
import { POST as checkoutRoute } from "@/app/api/checkout/route";
import {
  TestDbHarness,
  seedStandardCatalog,
} from "../helpers/test-harness";

const { activeHarnessRef } = vi.hoisted(() => ({
  activeHarnessRef: { current: null as TestDbHarness | null },
}));

vi.mock("@/shared/db/client", () => ({
  get db() {
    return activeHarnessRef.current?.getDb();
  },
}));

describe("E2E Commerce, Payments & Entitlements Flow (Integration)", () => {
  let harness: TestDbHarness;
  let catalog: ReturnType<typeof seedStandardCatalog>;

  beforeEach(() => {
    vi.restoreAllMocks();
    harness = new TestDbHarness();
    activeHarnessRef.current = harness;
    catalog = seedStandardCatalog(harness);
  });

  describe("ACC-02: Payment Verification Gateways (Mismatch & Identity Protection)", () => {
    const orderId = "order-acc02-test-0001";
    const invoiceId = "inv-acc02-test-0001";
    const transactionId = "txn-acc02-test-0001";
    const expectedPayable = 299000n;

    beforeEach(() => {
      // Seed order awaiting payment
      harness.tables.orders.push({
        id: orderId,
        buyerUserId: "user-buyer-001",
        buyerEmail: "buyer@example.com",
        buyerName: "Buyer Test",
        buyerMobile: "+6281234567890",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 299000n,
        discount: 0n,
        tax: 0n,
        payable: expectedPayable,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId: null,
        paidAt: null,
        refundStatus: "none",
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      });

      // Seed 3 bundle order items
      harness.tables.order_items.push(
        {
          id: "item-b1",
          orderId,
          bookId: catalog.book1.id,
          bookTitleSnapshot: catalog.book1.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-b2",
          orderId,
          bookId: catalog.book2.id,
          bookTitleSnapshot: catalog.book2.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-b3",
          orderId,
          bookId: catalog.book3.id,
          bookTitleSnapshot: catalog.book3.title,
          offerIdSnapshot: "bundle-3-books",
          price: 99000n,
        }
      );
    });

    it("rejects +1 IDR amount mismatch during settlement and leaves order unpaid", async () => {
      const mismatchedPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: expectedPayable + 1n,
        amount: expectedPayable + 1n, // +1 IDR mismatch
        currency: "IDR",
        evidenceHash: "a".repeat(64),
        verifiedAt: new Date(),
        adapterContractVersion: "2.0",
      };

      await expect(
        settleVerifiedPayment(mismatchedPayment, harness.getDb())
      ).rejects.toThrow(AmountMismatchError);

      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("AWAITING_PAYMENT");
      expect(orderInDb?.paidAt).toBeNull();
      expect(harness.tables.purchase_grants).toHaveLength(0);
      expect(harness.tables.verified_payments).toHaveLength(0);
    });

    it("rejects -1 IDR amount mismatch during settlement and leaves order unpaid", async () => {
      const mismatchedPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: expectedPayable - 1n,
        amount: expectedPayable - 1n, // -1 IDR mismatch
        currency: "IDR",
        evidenceHash: "a".repeat(64),
        verifiedAt: new Date(),
        adapterContractVersion: "2.0",
      };

      await expect(
        settleVerifiedPayment(mismatchedPayment, harness.getDb())
      ).rejects.toThrow(AmountMismatchError);

      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("AWAITING_PAYMENT");
      expect(harness.tables.purchase_grants).toHaveLength(0);
      expect(harness.tables.verified_payments).toHaveLength(0);
    });

    it("rejects +1/-1 IDR amount mismatch at Mayar adapter verification level", async () => {
      const client = new MayarClient({ apiKey: "test_key", environment: "sandbox" });
      const orderSnapshot: OrderSnapshot = {
        orderId,
        payable: expectedPayable,
        currency: "IDR",
        buyerEmail: "buyer@example.com",
      };

      // Mock Mayar returning invoice with +1 IDR
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 200,
            data: {
              id: invoiceId,
              transactionId,
              amount: Number(expectedPayable + 1n),
              status: "paid",
              userId: "merchant-primary",
            },
          }),
          { status: 200 }
        )
      );

      await expect(client.verifyPayment(orderSnapshot, invoiceId)).rejects.toThrow(
        AmountMismatchError
      );
    });

    it("rejects wrong merchant ID during settlement and aborts without grant creation", async () => {
      const wrongMerchantPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "attacker-merchant-666", // Wrong merchant
        invoiceId,
        transactionId,
        orderId,
        payableIdr: expectedPayable,
        amount: expectedPayable,
        currency: "IDR",
        evidenceHash: "b".repeat(64),
        verifiedAt: new Date(),
        adapterContractVersion: "2.0",
      };

      await expect(
        settleVerifiedPayment(wrongMerchantPayment, harness.getDb())
      ).rejects.toThrow(PaymentVerificationError);

      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("AWAITING_PAYMENT");
      expect(harness.tables.purchase_grants).toHaveLength(0);
      expect(harness.tables.verified_payments).toHaveLength(0);
    });

    it("rejects wrong environment (e.g. sandbox order settled with production payment)", async () => {
      const wrongEnvPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "production", // Order is sandbox
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: expectedPayable,
        amount: expectedPayable,
        currency: "IDR",
        evidenceHash: "c".repeat(64),
        verifiedAt: new Date(),
        adapterContractVersion: "2.0",
      };

      await expect(
        settleVerifiedPayment(wrongEnvPayment, harness.getDb())
      ).rejects.toThrow(PaymentVerificationError);

      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("AWAITING_PAYMENT");
      expect(harness.tables.purchase_grants).toHaveLength(0);
    });
  });

  describe("ACC-03: Atomic Bundle Grants & Transaction Rollback", () => {
    const orderId = "order-bundle-acc03";
    const buyerUserId = "user-buyer-bundle-123";
    const invoiceId = "inv-bundle-123";
    const transactionId = "txn-bundle-123";
    const payable = 299000n;

    beforeEach(() => {
      harness.tables.orders.push({
        id: orderId,
        buyerUserId,
        buyerEmail: "bundle.buyer@example.com",
        buyerName: "Bundle Buyer",
        buyerMobile: "+6281234567890",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 299000n,
        discount: 0n,
        tax: 0n,
        payable,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId: null,
        paidAt: null,
        refundStatus: "none",
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      });

      harness.tables.order_items.push(
        {
          id: "item-acc03-1",
          orderId,
          bookId: catalog.book1.id,
          bookTitleSnapshot: catalog.book1.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-acc03-2",
          orderId,
          bookId: catalog.book2.id,
          bookTitleSnapshot: catalog.book2.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-acc03-3",
          orderId,
          bookId: catalog.book3.id,
          bookTitleSnapshot: catalog.book3.title,
          offerIdSnapshot: "bundle-3-books",
          price: 99000n,
        }
      );
    });

    it("creates grants for all 3 books atomically on successful settlement", async () => {
      const validPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: payable,
        amount: payable,
        currency: "IDR",
        evidenceHash: "d".repeat(64),
        verifiedAt: new Date("2026-10-25T10:30:00.000Z"),
        adapterContractVersion: "2.0",
      };

      const result = await settleVerifiedPayment(validPayment, harness.getDb());
      expect(result.settled).toBe(true);

      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("PAID");
      expect(orderInDb?.paidAt).toBeInstanceOf(Date);
      expect(orderInDb?.transactionId).toBe(transactionId);

      // Verify all 3 books granted
      expect(harness.tables.purchase_grants).toHaveLength(3);
      const grantedBookIds = harness.tables.purchase_grants.map((g) => g.bookId);
      expect(grantedBookIds).toContain(catalog.book1.id);
      expect(grantedBookIds).toContain(catalog.book2.id);
      expect(grantedBookIds).toContain(catalog.book3.id);

      for (const grant of harness.tables.purchase_grants) {
        expect(grant.userId).toBe(buyerUserId);
        expect(grant.revokedAt).toBeFalsy();
      }

      // Exactly 1 verified payment audit record
      expect(harness.tables.verified_payments).toHaveLength(1);
      expect(harness.tables.verified_payments[0].transactionId).toBe(transactionId);

      // Exactly 1 outbox job
      expect(harness.tables.outbox_jobs).toHaveLength(1);
      expect(harness.tables.outbox_jobs[0].kind).toBe("order_settled");
    });

    it("rolls back entire settlement transaction if failure occurs during 2nd grant (0 grants, order unpaid)", async () => {
      let grantInsertCount = 0;

      // Create harness with failure hook on 2nd grant insert
      const failingHarness = new TestDbHarness(harness.tables, {
        onInsert: (table) => {
          if (table === "purchase_grants") {
            grantInsertCount++;
            if (grantInsertCount === 2) {
              throw new Error("DATABASE_CRASH_DURING_SECOND_GRANT");
            }
          }
        },
      });

      const validPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: payable,
        amount: payable,
        currency: "IDR",
        evidenceHash: "e".repeat(64),
        verifiedAt: new Date("2026-10-25T10:30:00.000Z"),
        adapterContractVersion: "2.0",
      };

      await expect(
        settleVerifiedPayment(validPayment, failingHarness.getDb())
      ).rejects.toThrow("DATABASE_CRASH_DURING_SECOND_GRANT");

      // Verify transaction rollback: ZERO grants, ZERO verified payments, order remains AWAITING_PAYMENT
      expect(failingHarness.tables.purchase_grants).toHaveLength(0);
      expect(failingHarness.tables.verified_payments).toHaveLength(0);
      expect(failingHarness.tables.outbox_jobs).toHaveLength(0);

      const orderInDb = failingHarness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("AWAITING_PAYMENT");
      expect(orderInDb?.paidAt).toBeNull();
      expect(orderInDb?.transactionId).toBeNull();
    });
  });

  describe("ACC-04: Concurrency & Lock Idempotency Gate", () => {
    it("handles 10 concurrent settlement invocations for same order with exactly 1 settlement and 1 set of grants without deadlocks", async () => {
      const orderId = "order-concurrent-acc04";
      const invoiceId = "inv-concurrent-acc04";
      const transactionId = "txn-concurrent-acc04";
      const payable = 299000n;

      harness.tables.orders.push({
        id: orderId,
        buyerUserId: "user-concurrent-001",
        buyerEmail: "concurrent@example.com",
        buyerName: "Concurrent Buyer",
        buyerMobile: "+6281234567890",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        subtotal: 299000n,
        discount: 0n,
        tax: 0n,
        payable,
        termsVersion: "2026-10-25",
        providerEnv: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId: null,
        paidAt: null,
        refundStatus: "none",
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      });

      harness.tables.order_items.push(
        {
          id: "item-c1",
          orderId,
          bookId: catalog.book1.id,
          bookTitleSnapshot: catalog.book1.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-c2",
          orderId,
          bookId: catalog.book2.id,
          bookTitleSnapshot: catalog.book2.title,
          offerIdSnapshot: "bundle-3-books",
          price: 100000n,
        },
        {
          id: "item-c3",
          orderId,
          bookId: catalog.book3.id,
          bookTitleSnapshot: catalog.book3.title,
          offerIdSnapshot: "bundle-3-books",
          price: 99000n,
        }
      );

      const verifiedPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId,
        transactionId,
        orderId,
        payableIdr: payable,
        amount: payable,
        currency: "IDR",
        evidenceHash: "f".repeat(64),
        verifiedAt: new Date("2026-10-25T10:00:00.000Z"),
        adapterContractVersion: "2.0",
      };

      // Execute 10 simultaneous settlement calls
      const concurrentInvocations = Array.from({ length: 10 }).map(() =>
        settleVerifiedPayment(verifiedPayment, harness.getDb())
      );

      const results = await Promise.all(concurrentInvocations);

      // All 10 succeeded without deadlocks or errors
      expect(results).toHaveLength(10);
      for (const res of results) {
        expect(res.settled).toBe(true);
        expect(res.orderId).toBe(orderId);
      }

      // Exactly 1 executed the primary settlement, 9 returned alreadySettled: true
      const primarySettlements = results.filter((r) => !r.alreadySettled);
      const idempotentReplays = results.filter((r) => r.alreadySettled);

      expect(primarySettlements).toHaveLength(1);
      expect(idempotentReplays).toHaveLength(9);

      // Exactly 3 grants exist for the 3 books (NOT 30!)
      expect(harness.tables.purchase_grants).toHaveLength(3);

      // Exactly 1 verified payment audit record (NOT 10!)
      expect(harness.tables.verified_payments).toHaveLength(1);

      // Exactly 1 outbox job
      expect(harness.tables.outbox_jobs).toHaveLength(1);

      // Order status is PAID
      const orderInDb = harness.tables.orders.find((o) => o.id === orderId);
      expect(orderInDb?.status).toBe("PAID");
    });
  });

  describe("ACC-06: Guest Checkout, Anti-Enumeration & Verified Claim Flow", () => {
    it("completes full guest lifecycle: checkout -> settlement (userId null) -> claim request -> wrong email denied 403 -> matching verified email succeeds -> unlocks chapters 2..14", async () => {
      const guestEmail = "guest.shopper@example.com";
      const wrongEmail = "attacker.hacker@evil.org";
      const idempotencyKey = "idem-guest-acc06-999";

      const mockMayarClient = {
        createInvoice: vi.fn().mockResolvedValue({
          id: "inv-guest-999",
          transactionId: "txn-guest-888",
          amount: 299000n,
          status: "unpaid",
          link: "https://mayar.id/inv-guest-999",
          paymentUrl: "https://mayar.id/inv-guest-999",
          userId: "merchant-primary",
        }),
        getInvoice: vi.fn().mockResolvedValue({
          id: "inv-guest-999",
          transactionId: "txn-guest-888",
          amount: 299000n,
          status: "paid",
          link: "https://mayar.id/inv-guest-999",
          paymentUrl: "https://mayar.id/inv-guest-999",
          userId: "merchant-primary",
        }),
        getTransaction: vi.fn().mockResolvedValue({
          id: "txn-guest-888",
          amount: 299000n,
          status: "paid",
          userId: "merchant-primary",
        }),
        verifyPayment: vi.fn(),
      };

      // 1. Guest creates checkout order
      const checkoutInput: CheckoutInput = {
        offerId: "bundle-3-books",
        email: guestEmail,
        name: "Guest Shopper",
        mobile: "+6281122334455",
      };

      const checkoutRes = await createCheckoutOrder(
        checkoutInput,
        idempotencyKey,
        null, // No actor (guest)
        "guest-session-uuid-1",
        harness.getDb(),
        mockMayarClient as unknown as MayarClient
      );

      expect(checkoutRes.status).toBe("AWAITING_PAYMENT");
      const orderId = checkoutRes.orderId;

      // Verify order created with buyerUserId: null
      const getOrderRow = () => harness.tables.orders.find((o) => o.id === orderId);
      expect(getOrderRow()).toBeDefined();
      expect(getOrderRow()?.buyerUserId).toBeNull();
      expect(getOrderRow()?.buyerEmail).toBe(guestEmail);

      // 2. Order settled via Mayar webhook / settlement coordinator
      const verifiedPayment: VerifiedPaymentData = {
        provider: "mayar",
        environment: "sandbox",
        merchantId: "merchant-primary",
        invoiceId: "inv-guest-999",
        transactionId: "txn-guest-888",
        orderId,
        payableIdr: 299000n,
        amount: 299000n,
        currency: "IDR",
        evidenceHash: "1".repeat(64),
        verifiedAt: new Date(),
        adapterContractVersion: "2.0",
      };

      const settleRes = await settleVerifiedPayment(verifiedPayment, harness.getDb());
      expect(settleRes.settled).toBe(true);

      // Verify order paid, but grants still have userId: null
      expect(getOrderRow()?.status).toBe("PAID");
      expect(harness.tables.purchase_grants).toHaveLength(3);
      for (const g of harness.tables.purchase_grants) {
        expect(g.userId).toBeNull();
      }

      // Guest actor before claiming has NO access to paid chapter (ch-2)
      const guestActor: Actor = {
        userId: "user-unclaimed-guest-1",
        verifiedEmail: guestEmail,
        roles: ["reader"],
        authTime: new Date(),
      };
      const canReadBeforeClaim = await canReadChapter(
        guestActor,
        catalog.book1.id,
        2,
        harness.getDb()
      );
      expect(canReadBeforeClaim).toBe(false);

      // 3. Guest requests claim email
      const claimRequest = await requestPurchaseClaim(orderId, guestEmail, harness.getDb());
      expect(claimRequest.claimId).toBeDefined();

      // Find claim token from enqueued claim_email outbox job
      const claimEmailJob = harness.tables.outbox_jobs.find(
        (j) => j.kind === "claim_email" && j.aggregateId === orderId
      );
      expect(claimEmailJob).toBeDefined();
      const jobPayload = (claimEmailJob?.payloadJson ??
        (claimEmailJob as Record<string, unknown> | undefined)?.payload) as {
        token: string;
        email: string;
      };
      const rawToken = jobPayload.token;
      expect(rawToken).toBeDefined();
      expect(jobPayload.email).toBe(guestEmail);

      // 4. Attacker / wrong actor attempts claim
      const wrongActor: Actor = {
        userId: "user-attacker-666",
        verifiedEmail: wrongEmail,
        roles: ["reader"],
        authTime: new Date(),
      };

      await expect(
        claimPurchase(rawToken, wrongActor, harness.getDb())
      ).rejects.toThrow("Authenticated verified email does not match order buyer email");

      // Verify attacker got nothing
      expect(getOrderRow()?.buyerUserId).toBeNull();
      for (const g of harness.tables.purchase_grants) {
        expect(g.userId).toBeNull();
      }

      // 5. Legitimate buyer logs in with matching verified email and claims purchase
      const legitActor: Actor = {
        userId: "user-legit-shopper-777",
        verifiedEmail: guestEmail,
        roles: ["reader"],
        authTime: new Date(),
      };

      const claimResult = await claimPurchase(rawToken, legitActor, harness.getDb());
      expect(claimResult.claimed).toBe(true);
      expect(claimResult.orderId).toBe(orderId);
      expect(claimResult.grantsCount).toBe(3);

      // Verify order and all 3 grants bound to legit actor
      expect(getOrderRow()?.buyerUserId).toBe(legitActor.userId);
      for (const g of harness.tables.purchase_grants) {
        expect(g.userId).toBe(legitActor.userId);
      }

      // Re-claiming with same token fails (single-use CAS)
      await expect(
        claimPurchase(rawToken, legitActor, harness.getDb())
      ).rejects.toThrow("Claim token has already been used");

      // 6. Verify buyer now has access to chapter 0, 1 (free sample) AND chapters 2..14 (paid)
      // Free samples
      expect(await canReadChapter(legitActor, catalog.book1.id, 0, harness.getDb())).toBe(true);
      expect(await canReadChapter(legitActor, catalog.book1.id, 1, harness.getDb())).toBe(true);

      // Paid chapters unlocked across all 3 books
      for (let ch = 2; ch <= 14; ch++) {
        expect(await canReadChapter(legitActor, catalog.book1.id, ch, harness.getDb())).toBe(true);
        expect(await canReadChapter(legitActor, catalog.book2.id, ch, harness.getDb())).toBe(true);
        expect(await canReadChapter(legitActor, catalog.book3.id, ch, harness.getDb())).toBe(true);
      }

      // getChapterForReading returns full HTML content
      const chapter2Read = await getChapterForReading(
        catalog.book1.slug,
        "ch-2",
        "id",
        "standard",
        legitActor,
        harness.getDb()
      );
      expect(chapter2Read?.isAllowed).toBe(true);
      expect(chapter2Read?.html).toContain("Konten rahasia berbayar bab 2");
    });
  });

  describe("ACC-15: Out-of-Lock Mayar Timeout & Idempotent Recovery", () => {
    it("transitions order to CREATE_UNKNOWN upon Mayar timeout without blind duplicate invoice recreation", async () => {
      const idempotencyKey = "idem-timeout-test-123";
      const checkoutInput: CheckoutInput = {
        offerId: "single-book-1",
        email: "timeout.user@example.com",
        name: "Timeout User",
        mobile: "+6281987654321",
      };

      const timeoutMayarClient = {
        createInvoice: vi.fn().mockRejectedValue(
          new MayarApiError("Gateway Timeout from Mayar", 504, {
            error: "upstream_timeout",
          })
        ),
        getInvoice: vi.fn(),
        getTransaction: vi.fn(),
        verifyPayment: vi.fn(),
      };

      // 1. Initial checkout experiences Mayar timeout
      const firstResult = await createCheckoutOrder(
        checkoutInput,
        idempotencyKey,
        null,
        "session-timeout-1",
        harness.getDb(),
        timeoutMayarClient as unknown as MayarClient
      );

      expect(firstResult.status).toBe("CREATE_UNKNOWN");
      expect(firstResult.orderId).toBeDefined();
      expect(firstResult.invoiceId).toBeUndefined();
      expect(firstResult.paymentUrl).toBeUndefined();

      // Check DB state: order exists in CREATE_UNKNOWN status
      const orderInDb = harness.tables.orders.find((o) => o.id === firstResult.orderId);
      expect(orderInDb?.status).toBe("CREATE_UNKNOWN");
      expect(timeoutMayarClient.createInvoice).toHaveBeenCalledTimes(1);

      // 2. Submitting same checkout key idempotently returns existing order without calling createInvoice again
      const replayResult = await createCheckoutOrder(
        checkoutInput,
        idempotencyKey,
        null,
        "session-timeout-1",
        harness.getDb(),
        timeoutMayarClient as unknown as MayarClient
      );

      expect(replayResult.orderId).toBe(firstResult.orderId);
      expect(replayResult.status).toBe("CREATE_UNKNOWN");
      expect(replayResult.idempotentReplay).toBe(true);

      // Verify createInvoice was NOT called again (still 1 call)
      expect(timeoutMayarClient.createInvoice).toHaveBeenCalledTimes(1);

      // 3. Submitting same idempotency key with different payload throws IDEMPOTENCY_PAYLOAD_MISMATCH
      const tamperedInput: CheckoutInput = {
        ...checkoutInput,
        email: "different.email@example.com",
      };

      await expect(
        createCheckoutOrder(
          tamperedInput,
          idempotencyKey,
          null,
          "session-timeout-1",
          harness.getDb(),
          timeoutMayarClient as unknown as MayarClient
        )
      ).rejects.toThrow(ConflictError);
    });

    it("verifies HTTP 202 Accepted status code on POST /api/checkout when order enters CREATE_UNKNOWN", async () => {
      // Mock global fetch for Mayar to simulate 504 timeout
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("ETIMEDOUT: Connection to api.mayar.io timed out")
      );

      // Create request with Idempotency-Key header
      const request = new NextRequest("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-route-timeout-777",
        },
        body: JSON.stringify({
          offerId: "single-book-1",
          email: "route.timeout@example.com",
          name: "Route User",
          mobile: "+6281234567890",
        }),
      });

      // Execute route with mock harness as defaultDb
      const response = await checkoutRoute(request);
      expect(response.status).toBe(202);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      const json = await response.json();
      expect(json.status).toBe("CREATE_UNKNOWN");
      expect(json.orderId).toBeDefined();
    });
  });
});
