import { describe, it, expect, vi, beforeEach } from "vitest";
import { getChapterForReading, extractTocFromHtml } from "@/modules/reading/access-guard";
import type { Actor } from "@/modules/identity/types";
import { books, chapters, chapterVariants } from "@/shared/db/schema/catalog";
import { contentRevisions, publishedPreviews } from "@/shared/db/schema/content";

describe("Reader Access Guard & Entitlement Verification (TDD)", () => {
  const book1Id = "11111111-1111-1111-1111-111111111111";
  const bookSlug = "mahir-memimpin-tim";

  const readerActor: Actor = {
    userId: "user-1111-1111-1111-111111111111",
    verifiedEmail: "reader@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const adminActor: Actor = {
    userId: "admin-9999-9999-9999-999999999999",
    verifiedEmail: "admin@crowasia.test",
    roles: ["admin"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  let mockBooks: any[];
  let mockChapters: any[];
  let mockVariants: any[];
  let mockRevisions: any[];
  let mockPreviews: any[];
  let mockPurchaseGrants: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBooks = [
      {
        id: book1Id,
        slug: bookSlug,
        status: "published",
        title: "Mahir Memimpin Tim",
        description: "Buku panduan praktis untuk lead baru",
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01"),
      },
    ];

    mockChapters = [];
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

    mockVariants = [];
    for (let i = 0; i < 15; i++) {
      mockVariants.push({
        id: `var-b1-${i}-id-std`,
        chapterId: `ch-b1-${i}`,
        locale: "id",
        register: "standard",
        publishedRevisionId: `rev-b1-${i}`,
        generation: 1,
      });
    }

    mockRevisions = [];
    for (let i = 0; i < 15; i++) {
      mockRevisions.push({
        id: `rev-b1-${i}`,
        variantId: `var-b1-${i}-id-std`,
        sourceMd: `# Bab ${i}\nKonten rahasia bab ${i}`,
        html: `<article><h1 id="title-${i}">Bab ${i}: Judul Bab ${i}</h1><h2 id="heading-${i}-1">Bagian 1: Pengenalan</h2><p>Konten rahasia bab ${i}</p><h3 id="sub-${i}-1">Subbagian 1.1</h3><p>Detail rahasia</p></article>`,
        metadataJson: {
          title: `Bab ${i}: Judul Bab ${i}`,
        },
      });
    }

    mockPreviews = [];
    for (let i = 2; i < 15; i++) {
      mockPreviews.push({
        variantId: `var-b1-${i}-id-std`,
        previewText: `Ini adalah pratinjau cuplikan yang disetujui untuk Bab ${i}.`,
        previewHtml: `<div class="preview">Ini adalah pratinjau cuplikan Bab ${i}</div>`,
      });
    }

    mockPurchaseGrants = [];

    // Query builder mock supporting Drizzle ORM queries
    mockDb = {
      select: vi.fn().mockImplementation((_fields?: any) => {
        let fromTable: any = null;
        let whereCondition: any = null;
        let orderByCondition: any = null;

        const getFilterValue = (cond: any): any => {
          if (!cond) return undefined;
          if (Array.isArray(cond.queryChunks)) {
            for (const chunk of cond.queryChunks) {
              if (chunk && typeof chunk === "object" && (typeof chunk.value === "string" || typeof chunk.value === "number")) {
                return chunk.value;
              }
              if (typeof chunk === "string" && ![" = ", "(", ")", "", " AND ", " OR "].includes(chunk.trim())) {
                return chunk;
              }
            }
          }
          return cond.value;
        };

        const builder: any = {
          from: vi.fn().mockImplementation((table: any) => {
            fromTable = table;
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
          limit: vi.fn().mockImplementation((_n: number) => {
            return Promise.resolve(builder.execute().slice(0, _n));
          }),
          execute: () => {
            const val = getFilterValue(whereCondition);

            if (fromTable === books) {
              if (val) {
                return mockBooks.filter((b) => b.slug === val);
              }
              return mockBooks;
            }
            if (fromTable === chapters) {
              return mockChapters;
            }
            if (fromTable === chapterVariants) {
              if (val) {
                return mockVariants.filter((v) => v.chapterId === val);
              }
              return mockVariants;
            }
            if (fromTable === contentRevisions) {
              if (val) {
                return mockRevisions.filter((r) => r.id === val || r.variantId === val);
              }
              return mockRevisions;
            }
            if (fromTable === publishedPreviews) {
              if (val) {
                return mockPreviews.filter((p) => p.variantId === val);
              }
              return mockPreviews;
            }
            // purchase grants check in canReadChapter
            return mockPurchaseGrants;
          },
        };

        builder.then = (resolve: any) => resolve(builder.execute());
        return builder;
      }),
    };
  });

  describe("TOC Extraction Helper", () => {
    it("extracts h2 and h3 headings with id, title, and level", () => {
      const html = `
        <article>
          <h1 id="main-title">Judul Utama</h1>
          <h2 id="intro">Pengenalan Masalah</h2>
          <p>Teks pengantar</p>
          <h3 id="detail-1">Analisis Mendalam</h3>
          <p>Teks analisis</p>
          <h2 id="solution">Solusi Praktis</h2>
          <h4 id="minor">Abaikan Level 4</h4>
          <h2 id="footnote-label" class="sr-only">Catatan Kaki</h2>
        </article>
      `;

      const toc = extractTocFromHtml(html);
      expect(toc).toHaveLength(3);
      expect(toc[0]).toEqual({ id: "intro", title: "Pengenalan Masalah", level: 2 });
      expect(toc[1]).toEqual({ id: "detail-1", title: "Analisis Mendalam", level: 3 });
      expect(toc[2]).toEqual({ id: "solution", title: "Solusi Praktis", level: 2 });
    });

    it("generates fallback slug id if heading lacks an id attribute", () => {
      const html = `<h2>Langkah Pertama</h2>`;
      const toc = extractTocFromHtml(html);
      expect(toc).toHaveLength(1);
      expect(toc[0].id).toBe("langkah-pertama");
      expect(toc[0].title).toBe("Langkah Pertama");
      expect(toc[0].level).toBe(2);
    });
  });

  describe("Free Sample Chapters (0 and 1)", () => {
    it("returns full chapter HTML with isAllowed: true for anonymous reader (ch-0)", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-0", "id", "standard", null, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isFreeSample).toBe(true);
      expect(payload?.isAllowed).toBe(true);
      expect(payload?.chapterIndex).toBe(0);
      expect(payload?.bookTitle).toBe("Mahir Memimpin Tim");
      expect(payload?.html).toContain("Konten rahasia bab 0");
      expect(payload?.toc.length).toBeGreaterThan(0);
      expect(payload?.navigation.prev).toBeUndefined();
      expect(payload?.navigation.next?.slug).toBe("ch-1");
    });

    it("returns full chapter HTML with isAllowed: true for anonymous reader (ch-1)", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-1", "id", "standard", null, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isFreeSample).toBe(true);
      expect(payload?.isAllowed).toBe(true);
      expect(payload?.chapterIndex).toBe(1);
      expect(payload?.html).toContain("Konten rahasia bab 1");
      expect(payload?.navigation.prev?.slug).toBe("ch-0");
      expect(payload?.navigation.next?.slug).toBe("ch-2");
    });
  });

  describe("Paid Chapters (2..14) Access Guard & Anti-Data-Leak Invariant", () => {
    it("returns paywall view for anonymous users without paid HTML body", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-2", "id", "standard", null, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isFreeSample).toBe(false);
      expect(payload?.isAllowed).toBe(false);
      expect(payload?.chapterIndex).toBe(2);

      // CRUCIAL ANTI-DATA-LEAK ASSERTION: html body MUST be undefined
      expect(payload?.html).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain("Konten rahasia bab 2");

      // Must provide approved preview text
      expect(payload?.previewText).toContain("pratinjau cuplikan yang disetujui untuk Bab 2");
      expect(payload?.navigation.prev?.slug).toBe("ch-1");
      expect(payload?.navigation.next?.slug).toBe("ch-3");
    });

    it("returns paywall view for authenticated user WITHOUT book grant without leaking HTML", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-5", "id", "standard", readerActor, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isAllowed).toBe(false);
      expect(payload?.html).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain("Konten rahasia bab 5");
      expect(payload?.previewText).toBeDefined();
    });

    it("returns full chapter HTML when authenticated user holds an active grant", async () => {
      // Grant active access
      mockPurchaseGrants.push({
        id: "grant-1",
        userId: readerActor.userId,
        bookId: book1Id,
        revokedAt: null,
      });

      const payload = await getChapterForReading(bookSlug, "ch-5", "id", "standard", readerActor, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isAllowed).toBe(true);
      expect(payload?.html).toBeDefined();
      expect(payload?.html).toContain("Konten rahasia bab 5");
    });

    it("returns full chapter HTML for admin / publisher (preview override)", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-7", "id", "standard", adminActor, mockDb);

      expect(payload).not.toBeNull();
      expect(payload?.isAllowed).toBe(true);
      expect(payload?.html).toContain("Konten rahasia bab 7");
    });
  });

  describe("Edge cases & Not Found handling", () => {
    it("returns null if book slug does not exist", async () => {
      const payload = await getChapterForReading("non-existent-book", "ch-0", "id", "standard", null, mockDb);
      expect(payload).toBeNull();
    });

    it("returns null if chapter slug does not exist", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-99", "id", "standard", null, mockDb);
      expect(payload).toBeNull();
    });

    it("handles last chapter (ch-14) with next navigation undefined", async () => {
      const payload = await getChapterForReading(bookSlug, "ch-14", "id", "standard", adminActor, mockDb);
      expect(payload).not.toBeNull();
      expect(payload?.navigation.prev?.slug).toBe("ch-13");
      expect(payload?.navigation.next).toBeUndefined();
    });

    it("falls back to querying latest revision by createdAt desc with limit(1) when publishedRevisionId is missing", async () => {
      mockVariants[0].publishedRevisionId = null;

      const payload = await getChapterForReading(bookSlug, "ch-0", "id", "standard", readerActor, mockDb);
      expect(payload).not.toBeNull();
      expect(payload?.isAllowed).toBe(true);
      expect(payload?.html).toContain("Bab 0: Judul Bab 0");
    });
  });
});
