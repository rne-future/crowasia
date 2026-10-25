import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasBookGrant,
  canReadChapter,
  listUserGrants,
} from "@/modules/entitlements/grants";
import type { Actor } from "@/modules/identity/types";
import { purchaseGrants, manualGrants } from "@/shared/db/schema/commerce";

describe("Entitlements & Grants Engine (TDD)", () => {
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

  const publisherActor: Actor = {
    userId: "pub-8888-8888-8888-888888888888",
    verifiedEmail: "publisher@crowasia.test",
    roles: ["publisher"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const bookId1 = "book-aaaa-1111";
  const bookId2 = "book-bbbb-2222";
  const bookId3 = "book-cccc-3333";

  let mockPurchaseGrants: any[];
  let mockManualGrants: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPurchaseGrants = [];
    mockManualGrants = [];

    mockDb = {
      select: vi.fn().mockImplementation((_fields?: any) => ({
        from: vi.fn().mockImplementation((table: any) => ({
          where: vi.fn().mockImplementation((_condition: any) => {
            const getActiveRows = () => {
              if (table === purchaseGrants) {
                return mockPurchaseGrants.filter((g) => !g.revokedAt);
              }
              if (table === manualGrants) {
                const now = Date.now();
                return mockManualGrants.filter(
                  (g) => !g.revokedAt && (!g.expiresAt || new Date(g.expiresAt).getTime() > now)
                );
              }
              return [];
            };

            const queryObj: any = {
              limit: vi.fn().mockImplementation((_n: number) => {
                return Promise.resolve(getActiveRows().slice(0, 1));
              }),
            };

            queryObj.then = (resolve: any) => resolve(getActiveRows());

            return queryObj;
          }),
        })),
      })),
    };
  });

  describe("canReadChapter", () => {
    it("allows chapterIndex 0 and 1 for anonymous users (null actor)", async () => {
      const canRead0 = await canReadChapter(null, bookId1, 0, mockDb);
      const canRead1 = await canReadChapter(null, bookId1, 1, mockDb);

      expect(canRead0).toBe(true);
      expect(canRead1).toBe(true);
    });

    it("allows chapterIndex 0 and 1 for authenticated readers without grants", async () => {
      mockPurchaseGrants = [];
      mockManualGrants = [];

      const canRead0 = await canReadChapter(readerActor, bookId1, 0, mockDb);
      const canRead1 = await canReadChapter(readerActor, bookId1, 1, mockDb);

      expect(canRead0).toBe(true);
      expect(canRead1).toBe(true);
    });

    it("denies chapterIndex >= 2 for anonymous users (null actor)", async () => {
      const canRead2 = await canReadChapter(null, bookId1, 2, mockDb);
      const canRead14 = await canReadChapter(null, bookId1, 14, mockDb);

      expect(canRead2).toBe(false);
      expect(canRead14).toBe(false);
    });

    it("denies out-of-bounds chapterIndex (< 0 or > 14)", async () => {
      expect(await canReadChapter(readerActor, bookId1, -1, mockDb)).toBe(false);
      expect(await canReadChapter(readerActor, bookId1, 15, mockDb)).toBe(false);
      expect(await canReadChapter(adminActor, bookId1, -1, mockDb)).toBe(false);
    });

    it("allows admin and publisher preview override on any chapter 2..14 even without grant", async () => {
      mockPurchaseGrants = [];
      mockManualGrants = [];

      const adminCanRead = await canReadChapter(adminActor, bookId1, 5, mockDb);
      const pubCanRead = await canReadChapter(publisherActor, bookId1, 12, mockDb);

      expect(adminCanRead).toBe(true);
      expect(pubCanRead).toBe(true);
    });

    it("denies chapterIndex 2..14 to reader when no active grant exists", async () => {
      mockPurchaseGrants = [];
      mockManualGrants = [];

      const canRead = await canReadChapter(readerActor, bookId1, 2, mockDb);
      expect(canRead).toBe(false);
    });

    it("allows chapterIndex 2..14 to reader when active purchase grant exists", async () => {
      mockPurchaseGrants = [
        {
          id: "grant-1",
          orderItemId: "item-1",
          bookId: bookId1,
          userId: readerActor.userId,
          grantedAt: new Date(),
          revokedAt: null,
        },
      ];

      const canRead = await canReadChapter(readerActor, bookId1, 3, mockDb);
      expect(canRead).toBe(true);
    });

    it("denies chapterIndex 2..14 to reader when purchase grant was revoked", async () => {
      mockPurchaseGrants = [
        {
          id: "grant-1",
          orderItemId: "item-1",
          bookId: bookId1,
          userId: readerActor.userId,
          grantedAt: new Date(Date.now() - 100000),
          revokedAt: new Date(),
        },
      ];

      const canRead = await canReadChapter(readerActor, bookId1, 3, mockDb);
      expect(canRead).toBe(false);
    });

    it("allows chapterIndex 2..14 to reader when active manual grant exists without expiration", async () => {
      mockManualGrants = [
        {
          id: "mgrant-1",
          bookId: bookId1,
          userId: readerActor.userId,
          grantedBy: adminActor.userId,
          reason: "reviewer access",
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
        },
      ];

      const canRead = await canReadChapter(readerActor, bookId1, 7, mockDb);
      expect(canRead).toBe(true);
    });

    it("allows chapterIndex 2..14 when manual grant has future expiration", async () => {
      mockManualGrants = [
        {
          id: "mgrant-2",
          bookId: bookId1,
          userId: readerActor.userId,
          grantedBy: adminActor.userId,
          reason: "promo 30 days",
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          createdAt: new Date(),
        },
      ];

      const canRead = await canReadChapter(readerActor, bookId1, 7, mockDb);
      expect(canRead).toBe(true);
    });

    it("denies chapterIndex 2..14 when manual grant has expired", async () => {
      mockManualGrants = [
        {
          id: "mgrant-3",
          bookId: bookId1,
          userId: readerActor.userId,
          grantedBy: adminActor.userId,
          reason: "expired trial",
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null,
          createdAt: new Date(),
        },
      ];

      const canRead = await canReadChapter(readerActor, bookId1, 7, mockDb);
      expect(canRead).toBe(false);
    });
  });

  describe("hasBookGrant", () => {
    it("returns true when active purchase grant exists", async () => {
      mockPurchaseGrants = [
        {
          id: "grant-1",
          bookId: bookId1,
          userId: readerActor.userId,
          revokedAt: null,
        },
      ];

      const hasGrant = await hasBookGrant(readerActor.userId, bookId1, mockDb);
      expect(hasGrant).toBe(true);
    });

    it("returns false when purchase grant is revoked and no manual grant exists", async () => {
      mockPurchaseGrants = [
        {
          id: "grant-1",
          bookId: bookId1,
          userId: readerActor.userId,
          revokedAt: new Date(),
        },
      ];

      const hasGrant = await hasBookGrant(readerActor.userId, bookId1, mockDb);
      expect(hasGrant).toBe(false);
    });

    it("returns true when active unexpired manual grant exists", async () => {
      mockPurchaseGrants = [];
      mockManualGrants = [
        {
          id: "mgrant-1",
          bookId: bookId2,
          userId: readerActor.userId,
          expiresAt: new Date(Date.now() + 100000),
          revokedAt: null,
        },
      ];

      const hasGrant = await hasBookGrant(readerActor.userId, bookId2, mockDb);
      expect(hasGrant).toBe(true);
    });

    it("returns false when user has no grants for the book", async () => {
      mockPurchaseGrants = [];
      mockManualGrants = [];

      const hasGrant = await hasBookGrant(readerActor.userId, bookId3, mockDb);
      expect(hasGrant).toBe(false);
    });
  });

  describe("listUserGrants", () => {
    it("returns array of unique book IDs owned by the user", async () => {
      mockPurchaseGrants = [
        { bookId: bookId1, userId: readerActor.userId, revokedAt: null },
        { bookId: bookId2, userId: readerActor.userId, revokedAt: null },
      ];
      mockManualGrants = [
        {
          bookId: bookId2, // duplicate in manual
          userId: readerActor.userId,
          expiresAt: null,
          revokedAt: null,
        },
        {
          bookId: bookId3,
          userId: readerActor.userId,
          expiresAt: new Date(Date.now() + 50000),
          revokedAt: null,
        },
      ];

      const grants = await listUserGrants(readerActor.userId, mockDb);
      expect(grants.sort()).toEqual([bookId1, bookId2, bookId3].sort());
    });

    it("excludes revoked and expired grants", async () => {
      mockPurchaseGrants = [
        { bookId: bookId1, userId: readerActor.userId, revokedAt: new Date() },
      ];
      mockManualGrants = [
        {
          bookId: bookId2,
          userId: readerActor.userId,
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null,
        },
      ];

      const grants = await listUserGrants(readerActor.userId, mockDb);
      expect(grants).toEqual([]);
    });
  });
});
