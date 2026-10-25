import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getUserDashboard } from "@/modules/search/service";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import DashboardPage from "@/app/[locale]/dashboard/page";
import type { UserDashboardData } from "@/modules/search/types";
import { books, chapters } from "@/shared/db/schema/catalog";
import { orders, orderItems, purchaseGrants, manualGrants } from "@/shared/db/schema/commerce";
import { readingProgress } from "@/shared/db/schema/reading";
import * as identityModule from "@/modules/identity/get-actor";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("Dashboard Service & View (TDD)", () => {
  const userId = "usr-1234-5678";
  const userEmail = "buyer@example.com";
  const book1Id = "b1111111-1111-1111-1111-111111111111";
  const book2Id = "b2222222-2222-2222-2222-222222222222";

  let mockBooks: any[];
  let mockChapters: any[];
  let mockPurchaseGrants: any[];
  let mockManualGrants: any[];
  let mockReadingProgress: any[];
  let mockOrders: any[];
  let mockOrderItems: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBooks = [
      {
        id: book1Id,
        slug: "book-1",
        title: "Buku 1: Mahir Memimpin Tim",
      },
      {
        id: book2Id,
        slug: "book-2",
        title: "Buku 2: Napas Panjang Memimpin Tim",
      },
    ];

    mockChapters = [
      {
        id: "ch-b1-3",
        bookId: book1Id,
        slug: "chapter-3",
        index: 3,
      },
    ];

    mockPurchaseGrants = [];
    mockManualGrants = [];
    mockReadingProgress = [];
    mockOrders = [];
    mockOrderItems = [];

    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => {
        let fromTable: any = null;
        let whereCond: any = null;

        const builder: any = {
          from: vi.fn().mockImplementation((t: any) => {
            fromTable = t;
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCond = cond;
            return builder;
          }),
          innerJoin: vi.fn().mockImplementation(() => builder),
          leftJoin: vi.fn().mockImplementation(() => builder),
          execute: () => {
            if (fromTable === purchaseGrants) return mockPurchaseGrants;
            if (fromTable === manualGrants) return mockManualGrants;
            if (fromTable === books) return mockBooks;
            if (fromTable === chapters) return mockChapters;
            if (fromTable === readingProgress) return mockReadingProgress;
            if (fromTable === orders) return mockOrders;
            if (fromTable === orderItems) return mockOrderItems;
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

  describe("getUserDashboard Service", () => {
    it("returns user identity, owned books from active purchase and manual grants", async () => {
      mockPurchaseGrants.push({
        id: "pg-1",
        userId,
        bookId: book1Id,
        grantedAt: new Date("2026-10-10"),
        revokedAt: null,
      });

      mockManualGrants.push({
        id: "mg-1",
        userId,
        bookId: book2Id,
        createdAt: new Date("2026-10-12"),
        revokedAt: null,
        expiresAt: new Date("2026-12-31"), // active
      });

      // Revoked grant should not appear
      mockPurchaseGrants.push({
        id: "pg-revoked",
        userId,
        bookId: "b3333333-3333-3333-3333-333333333333",
        grantedAt: new Date("2026-09-01"),
        revokedAt: new Date("2026-10-01"),
      });

      const data = await getUserDashboard(userId, userEmail, mockDb);

      expect(data.user.id).toBe(userId);
      expect(data.user.email).toBe(userEmail);
      expect(data.ownedBooks.length).toBe(2);
      expect(data.ownedBooks.some((b) => b.bookId === book1Id)).toBe(true);
      expect(data.ownedBooks.some((b) => b.bookId === book2Id)).toBe(true);
    });

    it("joins reading_progress to return latest read chapter position", async () => {
      mockPurchaseGrants.push({
        id: "pg-1",
        userId,
        bookId: book1Id,
        grantedAt: new Date("2026-10-10"),
        revokedAt: null,
      });

      const lastSeen = new Date("2026-10-24T10:00:00Z");
      mockReadingProgress.push({
        userId,
        bookId: book1Id,
        chapterId: "ch-b1-3",
        lastSeenAt: lastSeen,
      });

      const data = await getUserDashboard(userId, userEmail, mockDb);
      const b1 = data.ownedBooks.find((b) => b.bookId === book1Id);

      expect(b1).toBeDefined();
      expect(b1?.latestProgress).toBeDefined();
      expect(b1?.latestProgress?.chapterSlug).toBe("chapter-3");
      expect(b1?.latestProgress?.lastSeenAt).toEqual(lastSeen);
    });

    it("queries unclaimed guest orders with matching buyer_email and buyer_user_id IS NULL", async () => {
      const orderId1 = "ord-unclaimed-1";
      const orderId2 = "ord-claimed";
      const orderId3 = "ord-other-email";

      mockOrders.push(
        {
          id: orderId1,
          buyerUserId: null,
          buyerEmail: userEmail,
          status: "PAID",
          payable: 149000n,
          createdAt: new Date("2026-10-22"),
        },
        {
          id: orderId2,
          buyerUserId: "another-user",
          buyerEmail: userEmail,
          status: "PAID",
          payable: 59000n,
          createdAt: new Date("2026-10-20"),
        },
        {
          id: orderId3,
          buyerUserId: null,
          buyerEmail: "someone.else@example.com",
          status: "PAID",
          payable: 59000n,
          createdAt: new Date("2026-10-21"),
        }
      );

      mockOrderItems.push({
        id: "oi-1",
        orderId: orderId1,
        bookId: book1Id,
        bookTitleSnapshot: "Buku 1: Mahir Memimpin Tim",
      });

      const data = await getUserDashboard(userId, userEmail, mockDb);

      expect(data.unclaimedOrders.length).toBe(1);
      expect(data.unclaimedOrders[0].orderId).toBe(orderId1);
      expect(data.unclaimedOrders[0].amount).toBe(149000n);
      expect(data.unclaimedOrders[0].books).toContain("Buku 1: Mahir Memimpin Tim");
    });
  });

  describe("DashboardView Component", () => {
    it("renders owned books, last read progress, and continue reading button", () => {
      const sampleData: UserDashboardData = {
        user: { id: userId, email: userEmail },
        ownedBooks: [
          {
            bookId: book1Id,
            slug: "book-1",
            title: "Mahir Memimpin Tim",
            grantedAt: new Date("2026-10-10"),
            latestProgress: {
              chapterSlug: "chapter-3",
              chapterTitle: "Bab 3: Obrolan Target",
              lastSeenAt: new Date("2026-10-24"),
            },
          },
        ],
        unclaimedOrders: [],
      };

      const html = renderToStaticMarkup(<DashboardView data={sampleData} locale="id" />);

      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Bab 3: Obrolan Target");
      expect(html).toContain("Lanjutkan Membaca");
      expect(html).toContain("/id/read/book-1/chapter-3");
    });

    it("renders unclaimed guest purchase banner when unclaimed orders exist", () => {
      const sampleData: UserDashboardData = {
        user: { id: userId, email: userEmail },
        ownedBooks: [],
        unclaimedOrders: [
          {
            orderId: "ord-123",
            createdAt: new Date("2026-10-20"),
            amount: 149000n,
            books: ["Paket Lengkap 3 Buku"],
          },
        ],
      };

      const html = renderToStaticMarkup(<DashboardView data={sampleData} locale="id" />);

      expect(html).toContain("Pesanan Tamu Belum Diklaim");
      expect(html).toContain("Paket Lengkap 3 Buku");
      expect(html).toContain("Klaim");
    });

    it("renders empty state message when user owns no books", () => {
      const sampleData: UserDashboardData = {
        user: { id: userId, email: userEmail },
        ownedBooks: [],
        unclaimedOrders: [],
      };

      const html = renderToStaticMarkup(<DashboardView data={sampleData} locale="id" />);
      expect(html).toContain("Belum ada buku yang dimiliki");
    });
  });

  describe("DashboardPage (Protected Route)", () => {
    it("redirects to login when user is not authenticated", async () => {
      vi.spyOn(identityModule, "requireActor").mockRejectedValue(new Error("Unauthorized"));

      await DashboardPage({ params: Promise.resolve({ locale: "id" }) });

      expect(redirect).toHaveBeenCalledWith("/id/login");
    });
  });
});
