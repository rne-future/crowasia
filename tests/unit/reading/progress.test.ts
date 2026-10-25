import { describe, it, expect, vi, beforeEach } from "vitest";
import * as progressModule from "@/modules/reading/progress";
import {
  getReadingProgress,
  updateReadingProgress,
} from "@/modules/reading/progress";
import type { ReadingProgressDto } from "@/modules/reading/types";
import {
  GET as getReadingProgressRoute,
  PUT as putReadingProgressRoute,
} from "@/app/api/reading-progress/[book]/route";
import * as identityModule from "@/modules/identity/get-actor";
import type { Actor } from "@/modules/identity/types";
import { readingProgress } from "@/shared/db/schema/reading";
import { books } from "@/shared/db/schema/catalog";

describe("Reading Progress Service & Route (TDD)", () => {
  const userId = "user-1111-1111-1111-111111111111";
  const bookId = "b1111111-1111-1111-1111-111111111111";
  const bookSlug = "mahir-memimpin-tim";
  const chapterId = "ch-1111-1111-1111-1111-111111111111";
  const anchorId = "section-mindset";
  const revisionId = "rev-1111-1111-1111-1111-111111111111";

  const mockActor: Actor = {
    userId,
    verifiedEmail: "reader@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  let mockBooks: Array<{ id: string; slug: string; title: string }>;
  let mockProgressState: Array<{
    userId: string;
    bookId: string;
    chapterId: string;
    revisionId: string | null;
    anchorId: string | null;
    lastSeenAt: Date;
  }>;

  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBooks = [
      {
        id: bookId,
        slug: bookSlug,
        title: "Mahir Memimpin Tim",
      },
    ];

    mockProgressState = [];

    function extractValues(cond: any, visited = new Set<any>()): any[] {
      if (!cond || typeof cond !== "object" || visited.has(cond)) return [];
      visited.add(cond);

      const values: any[] = [];
      if ("value" in cond && cond.value !== undefined && !cond.table) {
        if (Array.isArray(cond.value)) {
          values.push(...cond.value);
        } else {
          values.push(cond.value);
        }
      }
      if (Array.isArray(cond.values)) {
        for (const v of cond.values) {
          values.push(v);
        }
      }
      if (Array.isArray(cond.queryChunks)) {
        for (const chunk of cond.queryChunks) {
          if (chunk && typeof chunk === "object" && !chunk.table) {
            values.push(...extractValues(chunk, visited));
          }
        }
      }
      return values;
    }

    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => {
        let fromTable: any = null;
        let whereCondition: any = null;

        const builder: any = {
          from: vi.fn().mockImplementation((table: any) => {
            fromTable = table;
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCondition = cond;
            return builder;
          }),
          limit: vi.fn().mockImplementation((_n: number) => {
            return Promise.resolve(builder.execute().slice(0, _n));
          }),
          execute: () => {
            const vals = extractValues(whereCondition);
            if (fromTable === books) {
              return mockBooks.filter((b) => vals.includes(b.slug) || vals.includes(b.id));
            }
            if (fromTable === readingProgress) {
              return mockProgressState.filter((p) => {
                if (vals.includes(userId) && p.userId !== userId) return false;
                if ((vals.includes(bookId) || vals.includes(bookSlug)) && p.bookId !== bookId) return false;
                return true;
              });
            }
            return [];
          },
        };
        builder.then = (resolve: any) => resolve(builder.execute());
        return builder;
      }),

      insert: vi.fn().mockImplementation((table: any) => {
        let insertedValues: any = null;

        const builder: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            insertedValues = vals;
            return builder;
          }),
          onConflictDoUpdate: vi.fn().mockImplementation(({ target, set }: any) => {
            const existingIndex = mockProgressState.findIndex(
              (p) => p.userId === insertedValues.userId && p.bookId === insertedValues.bookId
            );

            if (existingIndex !== -1) {
              mockProgressState[existingIndex] = {
                ...mockProgressState[existingIndex],
                chapterId: set.chapterId,
                revisionId: set.revisionId,
                anchorId: set.anchorId,
                lastSeenAt: set.lastSeenAt || new Date(),
              };
            } else {
              mockProgressState.push({
                ...insertedValues,
                lastSeenAt: insertedValues.lastSeenAt || new Date(),
              });
            }
            return Promise.resolve();
          }),
        };
        builder.then = (resolve: any) => resolve(builder.onConflictDoUpdate());
        return builder;
      }),
    };
  });

  describe("getReadingProgress", () => {
    it("returns null when no reading progress exists for user and book", async () => {
      const res = await getReadingProgress(userId, bookId, mockDb);
      expect(res).toBeNull();
    });

    it("returns ReadingProgressDto when record exists", async () => {
      const now = new Date();
      mockProgressState.push({
        userId,
        bookId,
        chapterId,
        revisionId,
        anchorId,
        lastSeenAt: now,
      });

      const res = await getReadingProgress(userId, bookId, mockDb);
      expect(res).not.toBeNull();
      expect(res).toMatchObject({
        userId,
        bookId,
        chapterId,
        revisionId,
        anchorId,
        lastSeenAt: now,
      });
    });
  });

  describe("updateReadingProgress", () => {
    it("inserts reading progress on initial write", async () => {
      await updateReadingProgress(userId, bookId, chapterId, revisionId, anchorId, mockDb);

      expect(mockProgressState).toHaveLength(1);
      expect(mockProgressState[0]).toMatchObject({
        userId,
        bookId,
        chapterId,
        revisionId,
        anchorId,
      });
      expect(mockProgressState[0].lastSeenAt).toBeInstanceOf(Date);
    });

    it("upserts and updates reading progress on subsequent write", async () => {
      mockProgressState.push({
        userId,
        bookId,
        chapterId: "ch-old",
        revisionId: "rev-old",
        anchorId: "old-anchor",
        lastSeenAt: new Date("2026-10-01"),
      });

      await updateReadingProgress(userId, bookId, chapterId, revisionId, anchorId, mockDb);

      expect(mockProgressState).toHaveLength(1);
      expect(mockProgressState[0].chapterId).toBe(chapterId);
      expect(mockProgressState[0].anchorId).toBe(anchorId);
    });
  });

  describe("API Routes for Reading Progress", () => {
    it("PUT /api/reading-progress/[book] requires authentication (401)", async () => {
      vi.spyOn(identityModule, "requireActor").mockRejectedValue(
        new Error("Unauthorized: actor authentication required")
      );

      const req = new Request(`http://localhost/api/reading-progress/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });

      const res = await putReadingProgressRoute(req, {
        params: Promise.resolve({ book: bookId }),
      });

      expect(res.status).toBe(401);
    });

    it("GET /api/reading-progress/[book] requires authentication (401)", async () => {
      vi.spyOn(identityModule, "requireActor").mockRejectedValue(
        new Error("Unauthorized: actor authentication required")
      );

      const req = new Request(`http://localhost/api/reading-progress/${bookId}`, {
        method: "GET",
      });

      const res = await getReadingProgressRoute(req, {
        params: Promise.resolve({ book: bookId }),
      });

      expect(res.status).toBe(401);
    });

    it("PUT /api/reading-progress/[book] returns 400 when chapterId is missing", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);

      const req = new Request(`http://localhost/api/reading-progress/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorId: "anchor" }),
      });

      const res = await putReadingProgressRoute(req, {
        params: Promise.resolve({ book: bookId }),
      });

      expect(res.status).toBe(400);
    });

    it("PUT /api/reading-progress/[book] updates progress and returns 200 { updated: true }", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      const updateSpy = vi.spyOn(progressModule, "updateReadingProgress").mockResolvedValue();

      const req = new Request(`http://localhost/api/reading-progress/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, anchorId }),
      });

      const res = await putReadingProgressRoute(req, {
        params: Promise.resolve({ book: bookId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ updated: true });
      expect(updateSpy).toHaveBeenCalledWith(
        userId,
        bookId,
        chapterId,
        undefined,
        anchorId
      );
    });

    it("GET /api/reading-progress/[book] returns 200 with reading progress", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      const now = new Date();
      vi.spyOn(progressModule, "getReadingProgress").mockResolvedValue({
        userId,
        bookId,
        chapterId,
        revisionId,
        anchorId,
        lastSeenAt: now,
      });

      const req = new Request(`http://localhost/api/reading-progress/${bookId}`, {
        method: "GET",
      });

      const res = await getReadingProgressRoute(req, {
        params: Promise.resolve({ book: bookId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        userId,
        bookId,
        chapterId,
        revisionId,
        anchorId,
      });
    });
  });
});
