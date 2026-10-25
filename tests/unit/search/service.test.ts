import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTopics } from "@/modules/search/service";
import type { Actor } from "@/modules/identity/types";
import { books, chapters, chapterVariants } from "@/shared/db/schema/catalog";
import { searchPublic, searchPrivate } from "@/shared/db/schema/search";
import { purchaseGrants, manualGrants } from "@/shared/db/schema/commerce";

describe("Search Service (TDD)", () => {
  const book1Id = "11111111-1111-1111-1111-111111111111";
  const book2Id = "22222222-2222-2222-2222-222222222222";
  const book3Id = "33333333-3333-3333-3333-333333333333";

  const readerActor: Actor = {
    userId: "user-reader-1",
    verifiedEmail: "reader@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25"),
  };

  const adminActor: Actor = {
    userId: "user-admin-1",
    verifiedEmail: "admin@example.com",
    roles: ["admin"],
    authTime: new Date("2026-10-25"),
  };

  let mockBooks: any[];
  let mockChapters: any[];
  let mockVariants: any[];
  let mockSearchPublic: any[];
  let mockSearchPrivate: any[];
  let mockPurchaseGrants: any[];
  let mockManualGrants: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBooks = [
      {
        id: book1Id,
        slug: "book-1",
        status: "published",
        title: "Buku 1: Mahir Memimpin Tim",
      },
      {
        id: book2Id,
        slug: "book-2",
        status: "published",
        title: "Buku 2: Napas Panjang Memimpin Tim",
      },
      {
        id: book3Id,
        slug: "book-3",
        status: "published",
        title: "Buku 3: Melipatgandakan Dampak Tim",
      },
    ];

    mockChapters = [];
    mockVariants = [];
    mockSearchPublic = [];
    mockSearchPrivate = [];

    // Populate chapters for books
    const bookConfigs = [
      {
        id: book1Id,
        slug: "book-1",
        ch7Title: "Obrolan 1: Menyepakati Target di Awal (Rumus 3K)",
        ch7Preview: "Pratinjau Rumus 3K: Menyepakati Keluaran, Kriteria Sukses, dan Kalender.",
        ch7Private: "Isi Bab 7 Buku 1: Praktikkan Rumus 3K bersama staf untuk mengunci komitmen kerja sejak hari pertama.",
      },
      {
        id: book2Id,
        slug: "book-2",
        ch7Title: "Langkah 1: Mengaudit Kalender & Memangkas Rutinitas Mubazir (Rumus 3P)",
        ch7Preview: "Pratinjau Rumus 3P: Pangkas, Pindahkan, dan Pertahankan rutinitas kerja.",
        ch7Private: "Isi Bab 7 Buku 2: Cara mengaudit kalender dengan Rumus 3P agar menghemat 4 hingga 6 jam seminggu.",
      },
      {
        id: book3Id,
        slug: "book-3",
        ch7Title: "Forum 1: Menyelaraskan Sasaran Antar-Tim di Awal Kuartal (Rumus 3S)",
        ch7Preview: "Pratinjau Rumus 3S: Sasaran Bersama, Sekat Peran, dan Simpul Koordinasi.",
        ch7Private: "Isi Bab 7 Buku 3: Selaraskan irama divisi lewat Forum 1 dengan Rumus 3S di awal setiap kuartal.",
      },
    ];

    for (const b of bookConfigs) {
      for (let i = 0; i <= 14; i++) {
        const chId = `ch-${b.slug}-${i}`;
        const varId = `var-${b.slug}-${i}`;
        const isCh7 = i === 7;
        const isFreeSample = i === 0 || i === 1;

        mockChapters.push({
          id: chId,
          bookId: b.id,
          index: i,
          slug: `chapter-${i}`,
          isFreeSample,
        });

        mockVariants.push({
          id: varId,
          chapterId: chId,
          locale: "id",
          register: "standard",
        });

        const title = isCh7 ? b.ch7Title : `Bab ${i}: Topik ${b.slug} bab ${i}`;
        const previewText = isCh7 ? b.ch7Preview : `Preview bab ${i} untuk ${b.slug}`;
        const privateText = isCh7 ? b.ch7Private : `Private full text bab ${i} untuk ${b.slug}`;

        mockSearchPublic.push({
          variantId: varId,
          revisionId: `rev-${varId}`,
          title,
          previewText,
          tags: isCh7 ? ["SOS", "rumus", "manajemen"] : ["manajemen"],
        });

        mockSearchPrivate.push({
          variantId: varId,
          revisionId: `rev-${varId}`,
          text: privateText,
        });
      }
    }

    mockPurchaseGrants = [];
    mockManualGrants = [];

    // Mock DB builder supporting standard queries
    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => {
        let fromTable: any = null;
        let whereCondition: any = null;
        let joins: any[] = [];

        const builder: any = {
          from: vi.fn().mockImplementation((t: any) => {
            fromTable = t;
            return builder;
          }),
          innerJoin: vi.fn().mockImplementation((t: any, on: any) => {
            joins.push({ table: t, on });
            return builder;
          }),
          leftJoin: vi.fn().mockImplementation((t: any, on: any) => {
            joins.push({ table: t, on });
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCondition = cond;
            return builder;
          }),
          limit: vi.fn().mockImplementation((n: number) => {
            return Promise.resolve(builder.execute().slice(0, n));
          }),
          execute: () => {
            if (fromTable === purchaseGrants) {
              return mockPurchaseGrants;
            }
            if (fromTable === manualGrants) {
              return mockManualGrants;
            }
            if (fromTable === books) {
              return mockBooks;
            }
            if (fromTable === chapters) {
              return mockChapters;
            }
            if (fromTable === chapterVariants) {
              return mockVariants;
            }
            if (fromTable === searchPublic) {
              return mockSearchPublic;
            }
            if (fromTable === searchPrivate) {
              return mockSearchPrivate;
            }
            return [];
          },
          then: (resolve: any, reject?: any) => {
            try {
              return resolve(builder.execute());
            } catch (err) {
              if (reject) return reject(err);
              throw err;
            }
          },
        };
        return builder;
      }),
    };
  });

  describe("Query Length Validation", () => {
    it("returns empty result if query has fewer than 2 characters", async () => {
      const resEmpty = await searchTopics("", "id", readerActor, mockDb);
      expect(resEmpty.total).toBe(0);
      expect(resEmpty.results).toEqual([]);

      const resOne = await searchTopics("a", "id", readerActor, mockDb);
      expect(resOne.total).toBe(0);
      expect(resOne.results).toEqual([]);

      const resSpaces = await searchTopics("   ", "id", readerActor, mockDb);
      expect(resSpaces.total).toBe(0);
      expect(resSpaces.results).toEqual([]);
    });

    it("returns empty result if query exceeds 120 characters", async () => {
      const longQuery = "a".repeat(121);
      const resLong = await searchTopics(longQuery, "id", readerActor, mockDb);
      expect(resLong.total).toBe(0);
      expect(resLong.results).toEqual([]);
    });
  });

  describe("SOS Query Mappings", () => {
    it("maps '3K' or 'rumus 3k' to Book 1 Chapter 7", async () => {
      const res1 = await searchTopics("3K", "id", null, mockDb);
      expect(res1.results.length).toBeGreaterThanOrEqual(1);
      const top1 = res1.results[0];
      expect(top1.bookSlug).toBe("book-1");
      expect(top1.chapterIndex).toBe(7);
      expect(top1.chapterTitle).toBe("Obrolan 1: Menyepakati Target di Awal (Rumus 3K)");
      expect(top1.href).toBe("/id/read/book-1/chapter-7");

      const res2 = await searchTopics("  rumus 3k  ", "id", null, mockDb);
      expect(res2.results.length).toBeGreaterThanOrEqual(1);
      expect(res2.results[0].chapterIndex).toBe(7);
      expect(res2.results[0].bookSlug).toBe("book-1");
    });

    it("maps '3P' or 'rumus 3p' to Book 2 Chapter 7", async () => {
      const res = await searchTopics("Rumus 3P", "id", null, mockDb);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      const top = res.results[0];
      expect(top.bookSlug).toBe("book-2");
      expect(top.chapterIndex).toBe(7);
      expect(top.chapterTitle).toBe(
        "Langkah 1: Mengaudit Kalender & Memangkas Rutinitas Mubazir (Rumus 3P)"
      );
      expect(top.href).toBe("/id/read/book-2/chapter-7");
    });

    it("maps '3S' or 'rumus 3s' to Book 3 Chapter 7", async () => {
      const res = await searchTopics("3s", "id", null, mockDb);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      const top = res.results[0];
      expect(top.bookSlug).toBe("book-3");
      expect(top.chapterIndex).toBe(7);
      expect(top.chapterTitle).toBe(
        "Forum 1: Menyelaraskan Sasaran Antar-Tim di Awal Kuartal (Rumus 3S)"
      );
      expect(top.href).toBe("/id/read/book-3/chapter-7");
    });
  });

  describe("Access Filter & Snippet Security Invariant", () => {
    it("non-owning user receives previewText, isOwned=false, and NO paid snippetText", async () => {
      // User has no grants for book-1
      const res = await searchTopics("rumus 3k", "id", readerActor, mockDb);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      const item = res.results[0];

      expect(item.isOwned).toBe(false);
      expect(item.isFreeSample).toBe(false);
      expect(item.snippetText).toBeUndefined(); // STRICT SECURITY REQUIREMENT!
      expect(item.previewText).toBeDefined();
      expect(item.previewText).toContain("Pratinjau Rumus 3K");
    });

    it("owner receives isOwned=true and safely highlighted snippetText", async () => {
      // Grant book 1 to readerActor
      mockPurchaseGrants.push({
        id: "grant-1",
        userId: readerActor.userId,
        bookId: book1Id,
        grantedAt: new Date("2026-10-20"),
        revokedAt: null,
      });

      const res = await searchTopics("rumus 3k", "id", readerActor, mockDb);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      const item = res.results[0];

      expect(item.isOwned).toBe(true);
      expect(item.snippetText).toBeDefined();
      // Snippet contains highlighted keyword span
      expect(item.snippetText).toMatch(/<mark[^>]*>.*3K.*<\/mark>/i);
      expect(item.highlights).toContain("3K");
    });

    it("admin/publisher receives isOwned=true and snippetText on gated chapters", async () => {
      const res = await searchTopics("rumus 3p", "id", adminActor, mockDb);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      const item = res.results[0];

      expect(item.isOwned).toBe(true);
      expect(item.snippetText).toBeDefined();
      expect(item.snippetText).toMatch(/<mark[^>]*>.*3P.*<\/mark>/i);
    });

    it("free sample chapters (ch-0 and ch-1) provide snippetText for anyone", async () => {
      // Suppose search matches chapter-0 or chapter-1
      mockSearchPublic[0].previewText = "Sample bab 0 gratis membahas pengantar manajemen.";
      mockSearchPrivate[0].text = "Isi lengkap bab 0 pengantar kepemimpinan bagi pemula.";

      const res = await searchTopics("pengantar", "id", null, mockDb);
      const sampleItem = res.results.find((r) => r.chapterIndex === 0);
      if (sampleItem) {
        expect(sampleItem.isFreeSample).toBe(true);
        expect(sampleItem.snippetText).toBeDefined();
      }
    });

    it("escapes raw HTML in private text when generating snippetText to prevent XSS", async () => {
      // Grant book 1 to reader
      mockPurchaseGrants.push({
        id: "grant-1",
        userId: readerActor.userId,
        bookId: book1Id,
        grantedAt: new Date("2026-10-20"),
        revokedAt: null,
      });

      // Chapter 7 private text contains HTML injection attempt
      const ch7Private = mockSearchPrivate.find((p) => p.variantId === "var-book-1-7");
      if (ch7Private) {
        ch7Private.text = 'Rumus 3K: <script>alert("xss")</script> & safe text.';
      }

      const res = await searchTopics("Rumus 3K", "id", readerActor, mockDb);
      const item = res.results[0];
      expect(item.snippetText).toBeDefined();
      expect(item.snippetText).not.toContain("<script>");
      expect(item.snippetText).toContain("&lt;script&gt;");
    });
  });
});
