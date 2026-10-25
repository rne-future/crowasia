import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCheckoutOrder,
  getOrderStatus,
  ConflictError,
  QuoteExpiredError,
  OrderNotFoundError,
  ForbiddenError,
  type CheckoutInput,
  type OfferQuote,
} from "@/modules/commerce";
import type { Actor } from "@/modules/identity/types";
import { orders, orderItems, checkoutRequests } from "@/shared/db/schema/commerce";
import { pricingTiers, tierBooks, books } from "@/shared/db/schema/catalog";

describe("Checkout Engine & Order State Machine (TDD)", () => {
  const actor: Actor = {
    userId: "user-1111-1111-1111-111111111111",
    verifiedEmail: "buyer@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const adminActor: Actor = {
    userId: "admin-9999-9999-9999-999999999999",
    verifiedEmail: "admin@crowasia.test",
    roles: ["admin"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const otherActor: Actor = {
    userId: "other-2222-2222-2222-222222222222",
    verifiedEmail: "stranger@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const validQuote: OfferQuote = {
    offerId: "bundle-3-books",
    tierId: "tier-1111",
    tierCode: "bundle-3-books",
    currency: "IDR",
    subtotal: 299000n,
    discount: 0n,
    tax: 0n,
    payable: 299000n,
    termsVersion: "2026-10-25",
    books: [
      { id: "book-1", slug: "mahir-memimpin-tim", title: "Mahir Memimpin Tim" },
      { id: "book-2", slug: "napas-panjang", title: "Napas Panjang" },
    ],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    token: "mock-valid-token",
  };

  const baseInput: CheckoutInput = {
    offerId: "bundle-3-books",
    email: "buyer@example.com",
    name: "John Doe",
    mobile: "+6281234567890",
    quote: validQuote,
  };

  let mockOrders: any[];
  let mockOrderItems: any[];
  let mockCheckoutRequests: any[];
  let mockDb: any;
  let mockMayarClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrders = [];
    mockOrderItems = [];
    mockCheckoutRequests = [];

    mockMayarClient = {
      createInvoice: vi.fn().mockResolvedValue({
        id: "inv-mayar-123",
        transactionId: null,
        amount: 299000n,
        status: "unpaid",
        link: "https://pay.mayar.id/inv-mayar-123",
        paymentUrl: "https://pay.mayar.id/inv-mayar-123",
        userId: "merchant-mayar-001",
      }),
      getInvoice: vi.fn().mockImplementation((invoiceId: string) =>
        Promise.resolve({
          id: invoiceId,
          amount: 299000n,
          status: "unpaid",
          link: `https://pay.mayar.id/${invoiceId}`,
          paymentUrl: `https://pay.mayar.id/${invoiceId}`,
        })
      ),
    };

    mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: any) => {
          let innerJoinTable: any = null;
          const queryObj: any = {
            innerJoin: vi.fn().mockImplementation((joinTable: any) => {
              innerJoinTable = joinTable;
              return queryObj;
            }),
            where: vi.fn().mockImplementation((condition: any) => {
              if (table === checkoutRequests) {
                return Promise.resolve(mockCheckoutRequests);
              }
              if (table === orders) {
                return Promise.resolve(mockOrders);
              }
              if (table === orderItems) {
                return Promise.resolve(mockOrderItems);
              }
              if (table === pricingTiers) {
                return Promise.resolve([
                  {
                    id: "tier-1111",
                    code: "bundle-3-books",
                    amountIdr: 299000n,
                    status: "active",
                    version: 1,
                    termsVersion: "2026-10-25",
                  },
                ]);
              }
              if (table === tierBooks) {
                return Promise.resolve([
                  { id: "book-1", slug: "mahir-memimpin-tim", title: "Mahir Memimpin Tim" },
                  { id: "book-2", slug: "napas-panjang", title: "Napas Panjang" },
                ]);
              }
              return Promise.resolve([]);
            }),
          };
          return queryObj;
        }),
      })),
      insert: vi.fn().mockImplementation((table: any) => ({
        values: vi.fn().mockImplementation((vals: any) => {
          const inserted = {
            id: vals.id ?? `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...vals,
            createdAt: vals.createdAt ?? new Date(),
            updatedAt: vals.updatedAt ?? new Date(),
          };
          if (table === orders) {
            mockOrders.push(inserted);
          } else if (table === orderItems) {
            mockOrderItems.push(inserted);
          } else if (table === checkoutRequests) {
            mockCheckoutRequests.push(inserted);
          }
          return {
            returning: vi.fn().mockResolvedValue([inserted]),
          };
        }),
      })),
      update: vi.fn().mockImplementation((table: any) => ({
        set: vi.fn().mockImplementation((patch: any) => ({
          where: vi.fn().mockImplementation(() => {
            if (table === orders && mockOrders.length > 0) {
              Object.assign(mockOrders[mockOrders.length - 1], patch);
            }
            return Promise.resolve([mockOrders[mockOrders.length - 1]]);
          }),
        })),
      })),
      transaction: vi.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb);
      }),
    };
  });

  describe("Idempotent Checkout Execution", () => {
    it("creates an order and returns AWAITING_PAYMENT with paymentUrl upon successful Mayar invoice creation", async () => {
      const result = await createCheckoutOrder(
        baseInput,
        "idem-key-1",
        actor,
        undefined,
        mockDb,
        mockMayarClient
      );

      expect(result.orderId).toBeDefined();
      expect(result.status).toBe("AWAITING_PAYMENT");
      expect(result.paymentUrl).toBe("https://pay.mayar.id/inv-mayar-123");

      // Verify orders row
      expect(mockOrders).toHaveLength(1);
      const savedOrder = mockOrders[0];
      expect(savedOrder.buyerEmail).toBe("buyer@example.com");
      expect(savedOrder.buyerUserId).toBe(actor.userId);
      expect(savedOrder.currency).toBe("IDR");
      expect(savedOrder.subtotal).toBe(299000n);
      expect(savedOrder.payable).toBe(299000n);
      expect(savedOrder.payable).toBe(savedOrder.subtotal - savedOrder.discount + savedOrder.tax);
      expect(savedOrder.status).toBe("AWAITING_PAYMENT");
      expect(savedOrder.invoiceId).toBe("inv-mayar-123");

      // Verify order_items snapshot rows
      expect(mockOrderItems).toHaveLength(2);
      expect(mockOrderItems[0].bookTitleSnapshot).toBe("Mahir Memimpin Tim");

      // Verify checkout_requests entry
      expect(mockCheckoutRequests).toHaveLength(1);
      expect(mockCheckoutRequests[0].idempotencyKey).toBe("idem-key-1");
    });

    it("idempotently returns existing order when re-invoked with same actor + same key + same payload", async () => {
      // First call
      const firstResult = await createCheckoutOrder(
        baseInput,
        "idem-key-1",
        actor,
        undefined,
        mockDb,
        mockMayarClient
      );

      expect(firstResult.status).toBe("AWAITING_PAYMENT");
      expect(mockMayarClient.createInvoice).toHaveBeenCalledTimes(1);

      // Second call with same idempotency key and same payload
      const secondResult = await createCheckoutOrder(
        baseInput,
        "idem-key-1",
        actor,
        undefined,
        mockDb,
        mockMayarClient
      );

      expect(secondResult.orderId).toBe(firstResult.orderId);
      expect(secondResult.status).toBe("AWAITING_PAYMENT");
      expect(secondResult.paymentUrl).toBe("https://pay.mayar.id/inv-mayar-123");
      // Must NOT call Mayar createInvoice a second time
      expect(mockMayarClient.createInvoice).toHaveBeenCalledTimes(1);
    });

    it("throws ConflictError (409) if same actor and key is called with different payload", async () => {
      // First call
      await createCheckoutOrder(
        baseInput,
        "idem-key-1",
        actor,
        undefined,
        mockDb,
        mockMayarClient
      );

      // Second call with different payload (e.g. different email)
      const modifiedInput: CheckoutInput = {
        ...baseInput,
        email: "different-email@example.com",
      };

      await expect(
        createCheckoutOrder(
          modifiedInput,
          "idem-key-1",
          actor,
          undefined,
          mockDb,
          mockMayarClient
        )
      ).rejects.toThrow(ConflictError);
    });

    it("throws QuoteExpiredError (409) if quote has expired", async () => {
      const expiredQuote: OfferQuote = {
        ...validQuote,
        expiresAt: new Date(Date.now() - 5000), // in the past
      };

      const expiredInput: CheckoutInput = {
        ...baseInput,
        quote: expiredQuote,
      };

      await expect(
        createCheckoutOrder(
          expiredInput,
          "idem-key-2",
          actor,
          undefined,
          mockDb,
          mockMayarClient
        )
      ).rejects.toThrow(QuoteExpiredError);

      // Zero orders created
      expect(mockOrders).toHaveLength(0);
    });

    it("marks order as CREATE_UNKNOWN when Mayar createInvoice throws a timeout or 5xx", async () => {
      mockMayarClient.createInvoice = vi.fn().mockRejectedValue(new Error("Mayar Gateway Timeout (504)"));

      const result = await createCheckoutOrder(
        baseInput,
        "idem-key-timeout",
        actor,
        undefined,
        mockDb,
        mockMayarClient
      );

      expect(result.orderId).toBeDefined();
      expect(result.status).toBe("CREATE_UNKNOWN");
      expect(result.paymentUrl).toBeUndefined();

      // Order status updated to CREATE_UNKNOWN in DB
      expect(mockOrders[0].status).toBe("CREATE_UNKNOWN");
    });
  });

  describe("Order Status Query (getOrderStatus)", () => {
    const existingOrder = {
      id: "order-test-123",
      buyerUserId: actor.userId,
      buyerEmail: "buyer@example.com",
      buyerName: "John Doe",
      buyerMobile: "+6281234567890",
      status: "AWAITING_PAYMENT",
      currency: "IDR",
      subtotal: 299000n,
      discount: 0n,
      tax: 0n,
      payable: 299000n,
      termsVersion: "2026-10-25",
      providerEnv: "sandbox",
      merchantId: "merchant-1",
      invoiceId: "inv-mayar-123",
      transactionId: null,
      paidAt: null,
      refundStatus: "none",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingItems = [
      {
        id: "item-1",
        orderId: existingOrder.id,
        bookId: "book-1",
        bookTitleSnapshot: "Mahir Memimpin Tim",
        offerIdSnapshot: "bundle-3-books",
        price: 299000n,
      },
    ];

    beforeEach(() => {
      mockOrders = [existingOrder];
      mockOrderItems = existingItems;
    });

    it("allows the buyer to inspect their own order", async () => {
      const status = await getOrderStatus(existingOrder.id, actor, undefined, mockDb);
      expect(status.orderId).toBe(existingOrder.id);
      expect(status.status).toBe("AWAITING_PAYMENT");
      expect(status.payable).toBe(299000n);
      expect(status.items).toHaveLength(1);
    });

    it("allows an admin actor to inspect any order", async () => {
      const status = await getOrderStatus(existingOrder.id, adminActor, undefined, mockDb);
      expect(status.orderId).toBe(existingOrder.id);
    });

    it("denies access to an unrelated user (ForbiddenError 403)", async () => {
      await expect(
        getOrderStatus(existingOrder.id, otherActor, undefined, mockDb)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws OrderNotFoundError (404) if order does not exist", async () => {
      mockOrders = [];
      await expect(
        getOrderStatus("non-existent-order", actor, undefined, mockDb)
      ).rejects.toThrow(OrderNotFoundError);
    });
  });

  describe("API Route: POST /api/checkout", () => {
    it("returns 400 when Idempotency-Key header is missing", async () => {
      const { POST } = await import("@/app/api/checkout/route");
      const apiInput = {
        offerId: "bundle-3-books",
        email: "buyer@example.com",
        name: "John Doe",
        mobile: "+6281234567890",
        quoteToken: "mock-valid-token",
      };

      const request = new Request("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiInput),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("MISSING_IDEMPOTENCY_KEY");
    });

    it("returns 400 when required fields are missing", async () => {
      const { POST } = await import("@/app/api/checkout/route");
      const request = new Request("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "test-key-missing-fields",
        },
        body: JSON.stringify({ offerId: "bundle-3-books" }), // missing email, name, mobile
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("MISSING_FIELDS");
    });

    it("returns 201 on successful checkout and sets guest_session cookie for unauthenticated buyers", async () => {
      const { POST } = await import("@/app/api/checkout/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "createCheckoutOrder").mockResolvedValue({
        orderId: "order-new-123",
        status: "AWAITING_PAYMENT",
        paymentUrl: "https://pay.mayar.id/inv-123",
        invoiceId: "inv-123",
      });

      const apiInput = {
        offerId: "bundle-3-books",
        email: "buyer@example.com",
        name: "John Doe",
        mobile: "+6281234567890",
        quoteToken: "mock-valid-token",
      };

      const request = new Request("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "key-guest-buyer",
        },
        body: JSON.stringify(apiInput),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.orderId).toBe("order-new-123");
      expect(json.status).toBe("AWAITING_PAYMENT");
      expect(json.paymentUrl).toBe("https://pay.mayar.id/inv-123");

      // Set-Cookie check for guest_session
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain("guest_session=");

      spy.mockRestore();
    });

    it("returns 202 when order status is CREATE_UNKNOWN due to gateway timeout", async () => {
      const { POST } = await import("@/app/api/checkout/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "createCheckoutOrder").mockResolvedValue({
        orderId: "order-unknown-123",
        status: "CREATE_UNKNOWN",
      });

      const apiInput = {
        offerId: "bundle-3-books",
        email: "buyer@example.com",
        name: "John Doe",
        mobile: "+6281234567890",
        quoteToken: "mock-valid-token",
      };

      const request = new Request("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "key-gateway-timeout",
        },
        body: JSON.stringify(apiInput),
      });

      const response = await POST(request);
      expect(response.status).toBe(202);
      const json = await response.json();
      expect(json.status).toBe("CREATE_UNKNOWN");

      spy.mockRestore();
    });

    it("returns 409 when quote is expired", async () => {
      const { POST } = await import("@/app/api/checkout/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "createCheckoutOrder").mockRejectedValue(
        new QuoteExpiredError("Quote has expired")
      );

      const apiInput = {
        offerId: "bundle-3-books",
        email: "buyer@example.com",
        name: "John Doe",
        mobile: "+6281234567890",
        quoteToken: "mock-valid-token",
      };

      const request = new Request("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "key-expired-quote",
        },
        body: JSON.stringify(apiInput),
      });

      const response = await POST(request);
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe("QUOTE_EXPIRED");

      spy.mockRestore();
    });
  });

  describe("API Route: GET /api/orders/[orderId]", () => {
    it("returns 200 with serialized order status", async () => {
      const { GET } = await import("@/app/api/orders/[orderId]/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "getOrderStatus").mockResolvedValue({
        orderId: "order-test-123",
        status: "AWAITING_PAYMENT",
        currency: "IDR",
        payable: 299000n,
        buyerEmail: "buyer@example.com",
        buyerName: "John Doe",
        invoiceId: "inv-mayar-123",
        paidAt: null,
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        items: [
          {
            bookId: "book-1",
            bookTitle: "Mahir Memimpin Tim",
            price: 299000n,
          },
        ],
      });

      const request = new Request("http://localhost:3000/api/orders/order-test-123");
      const response = await GET(request, { params: Promise.resolve({ orderId: "order-test-123" }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.orderId).toBe("order-test-123");
      expect(json.payable).toBe("299000");
      expect(json.items[0].price).toBe("299000");

      spy.mockRestore();
    });

    it("returns 403 when user is not authorized", async () => {
      const { GET } = await import("@/app/api/orders/[orderId]/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "getOrderStatus").mockRejectedValue(
        new ForbiddenError("You are not authorized to view this order")
      );

      const request = new Request("http://localhost:3000/api/orders/order-test-123");
      const response = await GET(request, { params: Promise.resolve({ orderId: "order-test-123" }) });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe("FORBIDDEN");

      spy.mockRestore();
    });

    it("returns 404 when order does not exist", async () => {
      const { GET } = await import("@/app/api/orders/[orderId]/route");
      const commerceModule = await import("@/modules/commerce");

      const spy = vi.spyOn(commerceModule, "getOrderStatus").mockRejectedValue(
        new OrderNotFoundError("Order not found: non-existent")
      );

      const request = new Request("http://localhost:3000/api/orders/non-existent");
      const response = await GET(request, { params: Promise.resolve({ orderId: "non-existent" }) });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.code).toBe("ORDER_NOT_FOUND");

      spy.mockRestore();
    });
  });
});
