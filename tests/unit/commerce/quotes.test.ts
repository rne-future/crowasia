import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOfferQuote,
  createQuoteToken,
  verifyQuoteToken,
  OfferNotFoundError,
  QuoteExpiredError,
  InvalidQuoteError,
  type OfferQuote,
} from "@/modules/commerce";
import { pricingTiers, tierBooks, books } from "@/shared/db/schema/catalog";

describe("Quotes Engine (TDD)", () => {
  const tierId = "11111111-1111-1111-1111-111111111111";
  const book1Id = "22222222-2222-2222-2222-222222222222";
  const book2Id = "33333333-3333-3333-3333-333333333333";

  let mockTiersState: any[];
  let mockTierBooksState: any[];
  let mockBooksState: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTiersState = [
      {
        id: tierId,
        code: "bundle-3-books",
        amountIdr: 299000n,
        status: "active",
        version: 1,
        termsVersion: "2026-10-25",
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        updatedAt: new Date("2026-10-20T00:00:00.000Z"),
      },
      {
        id: "99999999-9999-9999-9999-999999999999",
        code: "inactive-tier",
        amountIdr: 100000n,
        status: "inactive",
        version: 1,
        termsVersion: "2026-10-25",
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        updatedAt: new Date("2026-10-20T00:00:00.000Z"),
      },
    ];

    mockTierBooksState = [
      { tierId, bookId: book1Id },
      { tierId, bookId: book2Id },
    ];

    mockBooksState = [
      {
        id: book1Id,
        slug: "mahir-memimpin-tim",
        status: "published",
        title: "Mahir Memimpin Tim",
        description: "Buku 1",
      },
      {
        id: book2Id,
        slug: "napas-panjang-memimpin-tim",
        status: "published",
        title: "Napas Panjang Memimpin Tim",
        description: "Buku 2",
      },
    ];

    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => ({
        from: vi.fn().mockImplementation((table: any) => {
          let innerJoinedTable: any = null;

          const queryObj: any = {
            innerJoin: vi.fn().mockImplementation((joinTable: any) => {
              innerJoinedTable = joinTable;
              return queryObj;
            }),
            where: vi.fn().mockImplementation((condition: any) => {
              const resolve = () => {
                if (table === pricingTiers || table?.[Symbol.for("drizzle:Name")] === "pricing_tiers") {
                  // extract identifier
                  const tiers = mockTiersState.filter((t) => {
                    if (t.status !== "active") return false;
                    return true;
                  });
                  return tiers;
                }
                if (table === tierBooks || table?.[Symbol.for("drizzle:Name")] === "tier_books") {
                  // join with books
                  return mockTierBooksState.map((tb) => {
                    const b = mockBooksState.find((bk) => bk.id === tb.bookId);
                    return {
                      id: b?.id ?? tb.bookId,
                      slug: b?.slug ?? "",
                      title: b?.title ?? "",
                    };
                  });
                }
                return [];
              };
              return Promise.resolve(resolve());
            }),
          };
          return queryObj;
        }),
      })),
    };
  });

  it("computes exact IDR amount from pricing_tiers and returns included books", async () => {
    const quote = await getOfferQuote("bundle-3-books", mockDb);

    expect(quote.offerId).toBeDefined();
    expect(quote.tierCode).toBe("bundle-3-books");
    expect(quote.currency).toBe("IDR");
    expect(quote.subtotal).toBe(299000n);
    expect(quote.discount).toBe(0n);
    expect(quote.tax).toBe(0n);
    expect(quote.payable).toBe(299000n);
    expect(quote.payable).toBe(quote.subtotal - quote.discount + quote.tax);
    expect(quote.termsVersion).toBe("2026-10-25");
    expect(quote.books).toHaveLength(2);
    expect(quote.books[0].title).toBe("Mahir Memimpin Tim");
  });

  it("sets a 15-minute expiration on the quote", async () => {
    const before = Date.now();
    const quote = await getOfferQuote("bundle-3-books", mockDb);
    const after = Date.now();

    const fifteenMinutesMs = 15 * 60 * 1000;
    const expiresAtMs = quote.expiresAt.getTime();
    const createdAtMs = quote.createdAt.getTime();

    expect(expiresAtMs - createdAtMs).toBe(fifteenMinutesMs);
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + fifteenMinutesMs);
    expect(expiresAtMs).toBeLessThanOrEqual(after + fifteenMinutesMs);
  });

  it("generates a signed quote token that can be verified", async () => {
    const quote = await getOfferQuote("bundle-3-books", mockDb);

    expect(quote.token).toBeDefined();
    expect(typeof quote.token).toBe("string");

    const verified = verifyQuoteToken(quote.token);
    expect(verified.tierCode).toBe("bundle-3-books");
    expect(verified.amountIdr).toBe("299000");
  });

  it("throws OfferNotFoundError if tier does not exist or is inactive", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await expect(getOfferQuote("non-existent", mockDb)).rejects.toThrow(OfferNotFoundError);
  });

  it("throws InvalidQuoteError if quote token is tampered", () => {
    const quoteToken = createQuoteToken({
      tierId,
      tierCode: "bundle-3-books",
      amountIdr: "299000",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      termsVersion: "2026-10-25",
    });

    const tampered = quoteToken.slice(0, -4) + "XXXX";
    expect(() => verifyQuoteToken(tampered)).toThrow(InvalidQuoteError);
  });

  it("throws QuoteExpiredError if quote token has expired", () => {
    const expiredToken = createQuoteToken({
      tierId,
      tierCode: "bundle-3-books",
      amountIdr: "299000",
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired in past
      termsVersion: "2026-10-25",
    });

    expect(() => verifyQuoteToken(expiredToken)).toThrow(QuoteExpiredError);
  });

  describe("API Route: GET /api/quotes/[offerId]", () => {
    it("returns 200 with quote JSON when offer is found", async () => {
      const { GET } = await import("@/app/api/quotes/[offerId]/route");
      const request = new Request("http://localhost:3000/api/quotes/bundle-3-books");

      // Spy on getOfferQuote
      const quotesModule = await import("@/modules/commerce");
      const spy = vi.spyOn(quotesModule, "getOfferQuote").mockResolvedValue({
        offerId: "bundle-3-books",
        tierId: "tier-1111",
        tierCode: "bundle-3-books",
        currency: "IDR",
        subtotal: 299000n,
        discount: 0n,
        tax: 0n,
        payable: 299000n,
        termsVersion: "2026-10-25",
        books: [{ id: "book-1", slug: "book-1", title: "Book 1" }],
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        expiresAt: new Date("2026-10-25T10:15:00.000Z"),
        token: "mock-token",
      });

      const response = await GET(request, { params: Promise.resolve({ offerId: "bundle-3-books" }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-cache, no-store");

      const body = await response.json();
      expect(body.tierCode).toBe("bundle-3-books");
      expect(body.payable).toBe("299000");
      expect(body.token).toBe("mock-token");

      spy.mockRestore();
    });

    it("returns 404 when offer is not found", async () => {
      const { GET } = await import("@/app/api/quotes/[offerId]/route");
      const request = new Request("http://localhost:3000/api/quotes/unknown-offer");

      const quotesModule = await import("@/modules/commerce");
      const spy = vi.spyOn(quotesModule, "getOfferQuote").mockRejectedValue(
        new OfferNotFoundError("Offer not found: unknown-offer")
      );

      const response = await GET(request, { params: Promise.resolve({ offerId: "unknown-offer" }) });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.code).toBe("OFFER_NOT_FOUND");

      spy.mockRestore();
    });
  });
});
