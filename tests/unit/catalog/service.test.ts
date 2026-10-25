import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listPublishedBooks,
  getBookDetail,
  getBundleOffer,
} from "@/modules/catalog/service";
import { books, chapters, chapterVariants, pricingTiers, tierBooks } from "@/shared/db/schema/catalog";
import { contentDrafts } from "@/shared/db/schema/content";

describe("Catalog Service (TDD)", () => {
  const book1Id = "11111111-1111-1111-1111-111111111111";
  const book2Id = "22222222-2222-2222-2222-222222222222";
  const draftBookId = "33333333-3333-3333-3333-333333333333";

  const tier1Id = "t1111111-1111-1111-1111-111111111111";
  const tier2Id = "t2222222-2222-2222-2222-222222222222";
  const bundleTierId = "tbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  let mockBooks: any[];
  let mockChapters: any[];
  let mockVariants: any[];
  let mockTiers: any[];
  let mockTierBooks: any[];
  let mockDrafts: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBooks = [
      {
        id: book1Id,
        slug: "mahir-memimpin-tim",
        status: "published",
        title: "Mahir Memimpin Tim",
        description: "Buku panduan praktis untuk lead baru",
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01"),
      },
      {
        id: book2Id,
        slug: "napas-panjang-memimpin-tim",
        status: "published",
        title: "Napas Panjang Memimpin Tim",
        description: "Buku strategi sistem kerja mandiri",
        createdAt: new Date("2026-10-02"),
        updatedAt: new Date("2026-10-02"),
      },
      {
        id: draftBookId,
        slug: "draft-book",
        status: "draft",
        title: "Draft Book",
        description: "Not published yet",
        createdAt: new Date("2026-10-03"),
        updatedAt: new Date("2026-10-03"),
      },
    ];

    mockChapters = [];
    // 15 chapters for book 1
    for (let i = 0; i < 15; i++) {
      mockChapters.push({
        id: `ch-b1-${i}`,
        bookId: book1Id,
        index: i,
        slug: `ch-${i}`,
        isFreeSample: i === 0 || i === 1,
        createdAt: new Date("2026-10-01"),
      });
    }
    // 15 chapters for book 2
    for (let i = 0; i < 15; i++) {
      mockChapters.push({
        id: `ch-b2-${i}`,
        bookId: book2Id,
        index: i,
        slug: `ch-${i}`,
        isFreeSample: i === 0 || i === 1,
        createdAt: new Date("2026-10-02"),
      });
    }

    mockVariants = [
      { id: "var-b1-0-id", chapterId: "ch-b1-0", locale: "id", register: "standard" },
      { id: "var-b1-0-en", chapterId: "ch-b1-0", locale: "en", register: "standard" },
      { id: "var-b1-1-id", chapterId: "ch-b1-1", locale: "id", register: "standard" },
      { id: "var-b2-0-id", chapterId: "ch-b2-0", locale: "id", register: "standard" },
    ];

    mockDrafts = [
      {
        variantId: "var-b1-0-id",
        identityManifest: { title: "Pendahuluan: Saat Pertama Kali Memimpin" },
      },
      {
        variantId: "var-b1-1-id",
        identityManifest: { title: "Bab 1: Peralihan ke Peran Lead" },
      },
    ];

    mockTiers = [
      {
        id: tier1Id,
        code: "tier-book-1",
        amountIdr: 59000n,
        status: "active",
        version: 1,
        termsVersion: "v1.0",
      },
      {
        id: tier2Id,
        code: "tier-book-2",
        amountIdr: 79000n,
        status: "active",
        version: 1,
        termsVersion: "v1.0",
      },
      {
        id: bundleTierId,
        code: "tier-bundle",
        amountIdr: 149000n,
        status: "active",
        version: 1,
        termsVersion: "v1.0",
      },
    ];

    mockTierBooks = [
      { tierId: tier1Id, bookId: book1Id },
      { tierId: tier2Id, bookId: book2Id },
      { tierId: bundleTierId, bookId: book1Id },
      { tierId: bundleTierId, bookId: book2Id },
    ];

    // Mock Drizzle DB query builder
    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => {
        let selectedFields = fields;
        let fromTable: any = null;
        let joins: any[] = [];
        let whereCondition: any = null;
        let orderByCondition: any = null;
        let limitVal: number | null = null;

        const builder: any = {
          from: vi.fn().mockImplementation((table: any) => {
            fromTable = table;
            return builder;
          }),
          innerJoin: vi.fn().mockImplementation((joinTable: any, onCondition: any) => {
            joins.push({ type: "inner", table: joinTable, on: onCondition });
            return builder;
          }),
          leftJoin: vi.fn().mockImplementation((joinTable: any, onCondition: any) => {
            joins.push({ type: "left", table: joinTable, on: onCondition });
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCondition = cond;
            return builder;
          }),
          orderBy: vi.fn().mockImplementation((order: any) => {
            orderByCondition = order;
            return builder;
          }),
          limit: vi.fn().mockImplementation((l: number) => {
            limitVal = l;
            return builder;
          }),
          then: vi.fn().mockImplementation((resolve: any, reject?: any) => {
            try {
              const res = executeQuery();
              return Promise.resolve(res).then(resolve, reject);
            } catch (e) {
              return Promise.reject(e).then(resolve, reject);
            }
          }),
        };

        function executeQuery() {
          const tableName = fromTable?.[Symbol.for("drizzle:Name")] || fromTable?.name || "";

          // Query books
          if (fromTable === books || tableName === "books") {
            let res = [...mockBooks];
            // If filtering by status
            if (whereCondition) {
              if (whereCondition.value === "published" || whereCondition.right?.value === "published") {
                res = res.filter((b) => b.status === "published");
              } else if (typeof whereCondition.value === "string") {
                res = res.filter((b) => b.slug === whereCondition.value);
              } else {
                res = res.filter((b) => b.status === "published");
              }
            }
            if (limitVal !== null) {
              res = res.slice(0, limitVal);
            }
            return res;
          }

          // Query tierBooks + pricingTiers
          if (fromTable === tierBooks || tableName === "tier_books") {
            const hasPricingJoin = joins.some((j) => j.table === pricingTiers || j.table?.[Symbol.for("drizzle:Name")] === "pricing_tiers");
            if (hasPricingJoin) {
              return mockTierBooks
                .map((tb) => {
                  const t = mockTiers.find((tier) => tier.id === tb.tierId && tier.status === "active");
                  if (!t) return null;
                  return {
                    id: t.id,
                    tierId: t.id,
                    code: t.code,
                    amountIdr: t.amountIdr,
                    bookId: tb.bookId,
                  };
                })
                .filter(Boolean);
            }
            return mockTierBooks;
          }

          // Query chapters
          if (fromTable === chapters || tableName === "chapters") {
            let res = [...mockChapters];
            if (orderByCondition) {
              res.sort((a, b) => a.index - b.index);
            }
            return res;
          }

          // Query chapterVariants + contentDrafts
          if (fromTable === chapterVariants || tableName === "chapter_variants") {
            const hasDraftsJoin = joins.some((j) => j.table === contentDrafts || j.table?.[Symbol.for("drizzle:Name")] === "content_drafts");
            return mockVariants.map((v) => {
              const draft = hasDraftsJoin ? mockDrafts.find((d) => d.variantId === v.id) : null;
              return {
                id: v.id,
                chapterId: v.chapterId,
                locale: v.locale,
                register: v.register,
                identityManifest: draft?.identityManifest ?? null,
              };
            });
          }

          // Query pricingTiers
          if (fromTable === pricingTiers || tableName === "pricing_tiers") {
            return mockTiers.filter((t) => t.status === "active");
          }

          return [];
        }

        return builder;
      }),
    };
  });

  describe("listPublishedBooks", () => {
    it("returns published books with active IDR prices and chapter counts", async () => {
      const result = await listPublishedBooks("id", mockDb);

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.slug)).toEqual(["mahir-memimpin-tim", "napas-panjang-memimpin-tim"]);

      const book1 = result.find((b) => b.slug === "mahir-memimpin-tim");
      expect(book1).toBeDefined();
      expect(book1?.title).toBe("Mahir Memimpin Tim");
      expect(book1?.activePriceIdr).toBe(59000n);
      expect(book1?.chaptersCount).toBe(15);
      expect(book1?.availableLocales).toContain("id");
      expect(book1?.availableLocales).toContain("en");

      const book2 = result.find((b) => b.slug === "napas-panjang-memimpin-tim");
      expect(book2).toBeDefined();
      expect(book2?.activePriceIdr).toBe(79000n);
      expect(book2?.chaptersCount).toBe(15);
    });

    it("filters out unpublished draft books", async () => {
      const result = await listPublishedBooks("id", mockDb);
      expect(result.some((b) => b.slug === "draft-book")).toBe(false);
    });
  });

  describe("getBookDetail", () => {
    it("returns complete book detail with 15 chapters and free sample status", async () => {
      // customize mockDb for slug lookup
      mockDb.select = vi.fn().mockImplementation((fields?: any) => {
        let fromTable: any = null;
        let whereCond: any = null;
        let joins: any[] = [];
        const builder: any = {
          from: vi.fn().mockImplementation((tbl: any) => {
            fromTable = tbl;
            return builder;
          }),
          innerJoin: vi.fn().mockImplementation((tbl: any) => {
            joins.push({ table: tbl });
            return builder;
          }),
          leftJoin: vi.fn().mockImplementation((tbl: any) => {
            joins.push({ table: tbl });
            return builder;
          }),
          where: vi.fn().mockImplementation((w: any) => {
            whereCond = w;
            return builder;
          }),
          orderBy: vi.fn().mockImplementation(() => builder),
          limit: vi.fn().mockImplementation(() => builder),
          then: vi.fn().mockImplementation((resolve: any) => {
            const tableName = fromTable?.[Symbol.for("drizzle:Name")] || fromTable?.name || "";
            if (fromTable === books || tableName === "books") {
              return Promise.resolve([mockBooks[0]]).then(resolve);
            }
            if (fromTable === chapters || tableName === "chapters") {
              const chs = mockChapters.filter((c) => c.bookId === book1Id);
              return Promise.resolve(chs).then(resolve);
            }
            if (fromTable === tierBooks || tableName === "tier_books") {
              return Promise.resolve([
                { id: tier1Id, code: "tier-book-1", amountIdr: 59000n },
                { id: bundleTierId, code: "tier-bundle", amountIdr: 149000n },
              ]).then(resolve);
            }
            if (fromTable === chapterVariants || tableName === "chapter_variants") {
              return Promise.resolve([
                { chapterId: "ch-b1-0", locale: "id", identityManifest: { title: "Pendahuluan: Saat Pertama Kali Memimpin" } },
                { chapterId: "ch-b1-1", locale: "id", identityManifest: { title: "Bab 1: Peralihan ke Peran Lead" } },
              ]).then(resolve);
            }
            return Promise.resolve([]).then(resolve);
          }),
        };
        return builder;
      });

      const detail = await getBookDetail("mahir-memimpin-tim", "id", mockDb);

      expect(detail).not.toBeNull();
      expect(detail?.title).toBe("Mahir Memimpin Tim");
      expect(detail?.chaptersCount).toBe(15);
      expect(detail?.chapters).toHaveLength(15);

      // Chapter 0 & 1 must be free samples
      expect(detail?.chapters[0].isFreeSample).toBe(true);
      expect(detail?.chapters[0].slug).toBe("ch-0");
      expect(detail?.chapters[0].title).toBe("Pendahuluan: Saat Pertama Kali Memimpin");

      expect(detail?.chapters[1].isFreeSample).toBe(true);
      expect(detail?.chapters[1].slug).toBe("ch-1");

      // Chapters 2..14 must be locked
      for (let i = 2; i < 15; i++) {
        expect(detail?.chapters[i].isFreeSample).toBe(false);
      }

      // Tiers should include single tier and bundle tier
      expect(detail?.tiers).toHaveLength(2);
      expect(detail?.activePriceIdr).toBe(59000n);
    });

    it("returns null if book is not found", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const detail = await getBookDetail("non-existent-book", "id", mockDb);
      expect(detail).toBeNull();
    });
  });

  describe("getBundleOffer", () => {
    it("returns the bundle tier and linked book IDs", async () => {
      const offer = await getBundleOffer(mockDb);

      expect(offer).not.toBeNull();
      expect(offer?.tierId).toBe(bundleTierId);
      expect(offer?.amountIdr).toBe(149000n);
      expect(offer?.bookIds).toContain(book1Id);
      expect(offer?.bookIds).toContain(book2Id);
    });

    it("returns null when no bundle tier exists", async () => {
      mockTiers = mockTiers.filter((t) => t.id !== bundleTierId);
      mockTierBooks = mockTierBooks.filter((tb) => tb.tierId !== bundleTierId);

      const offer = await getBundleOffer(mockDb);
      expect(offer).toBeNull();
    });
  });
});
