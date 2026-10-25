import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestPurchaseClaim,
  claimPurchase,
} from "@/modules/entitlements/claim";
import { ClaimForbiddenError } from "@/modules/entitlements/types";
import { OrderNotFoundError } from "@/modules/commerce/types";
import { UnauthorizedError, type Actor } from "@/modules/identity/types";
import {
  orders,
  orderItems,
  purchaseClaims,
  purchaseGrants,
} from "@/shared/db/schema/commerce";
import { outboxJobs } from "@/shared/db/schema/jobs";
import { POST as claimRequestRoute } from "@/app/api/purchases/[orderId]/claim-request/route";
import { POST as claimRoute } from "@/app/api/purchases/claim/route";
import * as identityModule from "@/modules/identity/get-actor";

const {
  mockOrders,
  mockOrderItems,
  mockPurchaseClaims,
  mockPurchaseGrants,
  mockOutboxJobs,
  mockDb,
} = vi.hoisted(() => {
  const mOrders: any[] = [];
  const mOrderItems: any[] = [];
  const mClaims: any[] = [];
  const mGrants: any[] = [];
  const mOutbox: any[] = [];

  function matchesCondition(row: any, condition: any): boolean {
    if (!condition) return true;
    let colName: string | undefined;
    let targetVal: any;

    if (Array.isArray(condition?.queryChunks)) {
      for (const chunk of condition.queryChunks) {
        if (chunk && typeof chunk === "object") {
          if ("name" in chunk && typeof chunk.name === "string") {
            colName = chunk.name;
          }
          if ("encoder" in chunk && "value" in chunk) {
            targetVal = chunk.value;
          }
        }
      }
    }

    if (colName && targetVal !== undefined) {
      const camelCol = colName.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
      return row[camelCol] === targetVal || row[colName] === targetVal;
    }

    if (targetVal !== undefined) {
      return Object.values(row).some((v) => v === targetVal);
    }
    return true;
  }

  const db: any = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation((condition: any) => {
          const getRows = () => {
            if (table === orders) {
              return mOrders.filter((r) => matchesCondition(r, condition));
            }
            if (table === orderItems) {
              return mOrderItems.filter((r) => matchesCondition(r, condition));
            }
            if (table === purchaseClaims) {
              return mClaims.filter((r) => matchesCondition(r, condition));
            }
            if (table === purchaseGrants) {
              return mGrants.filter((r) => matchesCondition(r, condition));
            }
            return [];
          };

          const queryObj: any = {
            limit: vi.fn().mockImplementation((n: number) => {
              return Promise.resolve(getRows().slice(0, n));
            }),
          };

          queryObj.then = (resolve: any) => resolve(getRows());
          return queryObj;
        }),
      })),
    })),
    insert: vi.fn().mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((vals: any) => {
        const insertObj: any = {
          onConflictDoNothing: vi.fn().mockImplementation(() => {
            if (table === outboxJobs) {
              mOutbox.push(vals);
            }
            return Promise.resolve();
          }),
          returning: vi.fn().mockImplementation(() => {
            const row = { id: vals.id ?? `inserted-${Date.now()}`, ...vals };
            if (table === purchaseClaims) {
              mClaims.push(row);
            }
            return Promise.resolve([row]);
          }),
        };
        insertObj.then = (resolve: any) => {
          const row = { id: vals.id ?? `inserted-${Date.now()}`, ...vals };
          if (table === purchaseClaims) {
            mClaims.push(row);
          } else if (table === outboxJobs) {
            mOutbox.push(vals);
          }
          return resolve([row]);
        };
        return insertObj;
      }),
    })),
    update: vi.fn().mockImplementation((table: any) => ({
      set: vi.fn().mockImplementation((setVals: any) => ({
        where: vi.fn().mockImplementation((_condition: any) => {
          if (table === purchaseClaims) {
            for (const c of mClaims) {
              Object.assign(c, setVals);
            }
          } else if (table === orders) {
            for (const o of mOrders) {
              Object.assign(o, setVals);
            }
          } else if (table === purchaseGrants) {
            for (const g of mGrants) {
              Object.assign(g, setVals);
            }
          }
          return Promise.resolve();
        }),
      })),
    })),
    transaction: vi.fn().mockImplementation(async (cb: any) => cb(db)),
  };

  return {
    mockOrders: mOrders,
    mockOrderItems: mOrderItems,
    mockPurchaseClaims: mClaims,
    mockPurchaseGrants: mGrants,
    mockOutboxJobs: mOutbox,
    mockDb: db,
  };
});

vi.mock("@/shared/db/client", () => ({
  db: mockDb,
}));

describe("Guest Purchase Claims Engine (TDD)", () => {
  const orderId = "order-aaaa-1111-1111-111111111111";
  const buyerEmail = "guest.buyer@example.com";
  const bookId1 = "book-1111";
  const bookId2 = "book-2222";
  const orderItemId1 = "item-1111";
  const orderItemId2 = "item-2222";

  const guestActorWithMatchingEmail: Actor = {
    userId: "user-buyer-1234",
    verifiedEmail: "guest.buyer@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T12:00:00.000Z"),
  };

  const actorWithMismatchedEmail: Actor = {
    userId: "user-intruder-5678",
    verifiedEmail: "intruder@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T12:00:00.000Z"),
  };

  const actorWithUnverifiedEmail: Actor = {
    userId: "user-unverified-9999",
    verifiedEmail: "",
    roles: ["reader"],
    authTime: new Date("2026-10-25T12:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrders.length = 0;
    mockOrders.push({
      id: orderId,
      buyerUserId: null,
      buyerEmail: "guest.buyer@example.com",
      buyerName: "Guest Buyer",
      buyerMobile: "+6281234567890",
      status: "PAID",
      currency: "IDR",
      subtotal: 299000n,
      discount: 0n,
      tax: 0n,
      payable: 299000n,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "default",
      invoiceId: "inv-mayar-123",
      transactionId: "txn-mayar-123",
      paidAt: new Date("2026-10-25T10:00:00.000Z"),
      createdAt: new Date("2026-10-25T09:00:00.000Z"),
      updatedAt: new Date("2026-10-25T10:00:00.000Z"),
    });

    mockOrderItems.length = 0;
    mockOrderItems.push(
      {
        id: orderItemId1,
        orderId,
        bookId: bookId1,
        bookTitleSnapshot: "Book One",
        offerIdSnapshot: "bundle-2",
        price: 150000n,
      },
      {
        id: orderItemId2,
        orderId,
        bookId: bookId2,
        bookTitleSnapshot: "Book Two",
        offerIdSnapshot: "bundle-2",
        price: 149000n,
      }
    );

    mockPurchaseGrants.length = 0;
    mockPurchaseGrants.push(
      {
        id: "grant-1",
        orderItemId: orderItemId1,
        bookId: bookId1,
        userId: null,
        grantedAt: new Date("2026-10-25T10:00:00.000Z"),
        revokedAt: null,
        revokeReason: null,
      },
      {
        id: "grant-2",
        orderItemId: orderItemId2,
        bookId: bookId2,
        userId: null,
        grantedAt: new Date("2026-10-25T10:00:00.000Z"),
        revokedAt: null,
        revokeReason: null,
      }
    );

    mockPurchaseClaims.length = 0;
    mockOutboxJobs.length = 0;
  });

  describe("requestPurchaseClaim", () => {
    it("generates strong random token, stores sha256 hash in purchase_claims, and enqueues claim_email outbox job", async () => {
      const result = await requestPurchaseClaim(orderId, "GUEST.BUYER@example.com", mockDb);

      expect(result).toHaveProperty("claimId");
      expect(result).toHaveProperty("expiresAt");
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // 1. Verify purchase_claims insertion
      expect(mockPurchaseClaims.length).toBe(1);
      const claim = mockPurchaseClaims[0];
      expect(claim.orderId).toBe(orderId);
      expect(claim.tokenHash).toBeDefined();
      expect(claim.tokenHash.length).toBe(64); // sha256 hex length
      expect(claim.usedAt).toBeUndefined();

      // 2. Verify outbox job was enqueued with cleartext token for email delivery
      expect(mockOutboxJobs.length).toBe(1);
      const outbox = mockOutboxJobs[0];
      expect(outbox.kind).toBe("claim_email");
      expect(outbox.aggregateId).toBe(orderId);
      expect(outbox.payloadJson.email).toBe("guest.buyer@example.com");
      expect(typeof outbox.payloadJson.token).toBe("string");
      expect(outbox.payloadJson.token.length).toBeGreaterThanOrEqual(32);
      expect(outbox.payloadJson.expiresAt).toBeDefined();

      // Raw token must NOT be stored in DB
      expect(claim.tokenHash).not.toBe(outbox.payloadJson.token);
    });

    it("invalidates older unconsumed claims for the same order", async () => {
      const activeOldClaim = {
        id: "claim-old-1",
        orderId,
        tokenHash: "oldhash123",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
      };
      mockPurchaseClaims.push(activeOldClaim);

      await requestPurchaseClaim(orderId, buyerEmail, mockDb);

      expect(mockDb.update).toHaveBeenCalledWith(purchaseClaims);
      // Older claim should have expiresAt updated to now or past
      expect(activeOldClaim.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 500);
    });

    it("throws OrderNotFoundError if order does not exist", async () => {
      mockOrders.length = 0;
      await expect(
        requestPurchaseClaim("non-existent-order", buyerEmail, mockDb)
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("throws ClaimForbiddenError if order is not paid", async () => {
      mockOrders[0].status = "AWAITING_PAYMENT";
      await expect(
        requestPurchaseClaim(orderId, buyerEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });

    it("throws ClaimForbiddenError if email does not match buyerEmail", async () => {
      await expect(
        requestPurchaseClaim(orderId, "wrong.email@example.com", mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });
  });

  describe("claimPurchase", () => {
    let validToken: string;

    beforeEach(async () => {
      // Create a valid claim first
      const req = await requestPurchaseClaim(orderId, buyerEmail, mockDb);
      expect(req.claimId).toBeDefined();

      const outbox = mockOutboxJobs.find((j) => j.kind === "claim_email");
      validToken = outbox.payloadJson.token;
    });

    it("successfully claims purchase when authenticated actor verifiedEmail matches order buyerEmail", async () => {
      const result = await claimPurchase(validToken, guestActorWithMatchingEmail, mockDb);

      expect(result.claimed).toBe(true);
      expect(result.orderId).toBe(orderId);
      expect(result.grantsCount).toBe(2);

      // Verify claim updated with usedAt and claimedBy
      const claim = mockPurchaseClaims[0];
      expect(claim.usedAt).toBeDefined();
      expect(claim.claimedBy).toBe(guestActorWithMatchingEmail.userId);

      // Verify order buyerUserId updated
      expect(mockOrders[0].buyerUserId).toBe(guestActorWithMatchingEmail.userId);

      // Verify purchase_grants userId updated
      expect(mockPurchaseGrants[0].userId).toBe(guestActorWithMatchingEmail.userId);
      expect(mockPurchaseGrants[1].userId).toBe(guestActorWithMatchingEmail.userId);

      // Verify purchase_claimed outbox event enqueued
      const claimEvent = mockOutboxJobs.find((j) => j.kind === "purchase_claimed");
      expect(claimEvent).toBeDefined();
      expect(claimEvent.aggregateId).toBe(orderId);
      expect(claimEvent.payloadJson).toEqual({
        orderId,
        userId: guestActorWithMatchingEmail.userId,
      });
    });

    it("throws ClaimForbiddenError if actor verifiedEmail does not match order buyerEmail", async () => {
      await expect(
        claimPurchase(validToken, actorWithMismatchedEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);

      // Claim should not be marked as used
      expect(mockPurchaseClaims[0].usedAt).toBeUndefined();
    });

    it("throws ClaimForbiddenError if actor has no verified email", async () => {
      await expect(
        claimPurchase(validToken, actorWithUnverifiedEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });

    it("throws ClaimForbiddenError if token is invalid / not found", async () => {
      await expect(
        claimPurchase("invalid-random-token-12345", guestActorWithMatchingEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });

    it("throws ClaimForbiddenError if claim token has already been used", async () => {
      mockPurchaseClaims[0].usedAt = new Date();

      await expect(
        claimPurchase(validToken, guestActorWithMatchingEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });

    it("throws ClaimForbiddenError if claim token has expired", async () => {
      mockPurchaseClaims[0].expiresAt = new Date(Date.now() - 10000);

      await expect(
        claimPurchase(validToken, guestActorWithMatchingEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });

    it("throws ClaimForbiddenError if order was already claimed by another user", async () => {
      mockOrders[0].buyerUserId = "different-user-9999";

      await expect(
        claimPurchase(validToken, guestActorWithMatchingEmail, mockDb)
      ).rejects.toThrow(ClaimForbiddenError);
    });
  });

  describe("API Routes (TDD)", () => {
    describe("POST /api/purchases/[orderId]/claim-request", () => {
      it("returns 200 { requested: true } for valid request", async () => {
        vi.spyOn(identityModule, "getActor").mockResolvedValue(null);

        const request = new Request(`http://localhost:3000/api/purchases/${orderId}/claim-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: buyerEmail }),
        });

        const response = await claimRequestRoute(request, { params: Promise.resolve({ orderId }) });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.requested).toBe(true);
      });

      it("returns 200 { requested: true } without leaking existence when order or email mismatch (anti-enumeration)", async () => {
        const request = new Request(`http://localhost:3000/api/purchases/non-existent-order/claim-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "random@unknown.com" }),
        });

        const response = await claimRequestRoute(request, {
          params: Promise.resolve({ orderId: "non-existent-order" }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.requested).toBe(true);
      });

      it("returns 400 when email is missing or empty", async () => {
        const request = new Request(`http://localhost:3000/api/purchases/${orderId}/claim-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const response = await claimRequestRoute(request, { params: Promise.resolve({ orderId }) });
        expect(response.status).toBe(400);
      });
    });

    describe("POST /api/purchases/claim", () => {
      it("returns 401 when actor is not authenticated", async () => {
        vi.spyOn(identityModule, "requireActor").mockRejectedValue(
          new UnauthorizedError("Unauthorized")
        );

        const request = new Request("http://localhost:3000/api/purchases/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: "test-token" }),
        });

        const response = await claimRoute(request);
        expect(response.status).toBe(401);
      });

      it("returns 400 when token is missing", async () => {
        vi.spyOn(identityModule, "requireActor").mockResolvedValue(guestActorWithMatchingEmail);

        const request = new Request("http://localhost:3000/api/purchases/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const response = await claimRoute(request);
        expect(response.status).toBe(400);
      });

      it("returns 403 when claimPurchase throws ClaimForbiddenError", async () => {
        vi.spyOn(identityModule, "requireActor").mockResolvedValue(actorWithMismatchedEmail);

        const request = new Request("http://localhost:3000/api/purchases/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: "some-token" }),
        });

        const response = await claimRoute(request);
        expect(response.status).toBe(403);
      });
    });
  });
});
