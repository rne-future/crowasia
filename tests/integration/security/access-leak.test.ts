import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getChapterForReading } from "@/modules/reading/access-guard";
import { canReadChapter } from "@/modules/entitlements/grants";
import { searchTopics } from "@/modules/search/service";
import * as identityModule from "@/modules/identity/get-actor";
import { GET as searchRoute } from "@/app/api/search/route";
import type { Actor } from "@/modules/identity/types";
import {
  TestDbHarness,
  seedStandardCatalog,
} from "../helpers/test-harness";

const { activeHarnessRef, currentActorRef } = vi.hoisted(() => ({
  activeHarnessRef: { current: null as TestDbHarness | null },
  currentActorRef: { current: null as Actor | null },
}));

vi.mock("@/shared/db/client", () => ({
  get db() {
    return activeHarnessRef.current?.getDb();
  },
}));

describe("ACC-01: Anti-Data-Leak Access Control & Search Gate (Security Integration)", () => {
  let harness: TestDbHarness;
  let catalog: ReturnType<typeof seedStandardCatalog>;

  const userA: Actor = {
    userId: "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    verifiedEmail: "usera@crowasia.test",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const userB: Actor = {
    userId: "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    verifiedEmail: "userb@crowasia.test",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const secretKeyword = "CLASSIFIED_EXECUTIVE_PLAYBOOK_777";

  beforeEach(() => {
    vi.restoreAllMocks();
    harness = new TestDbHarness();
    activeHarnessRef.current = harness;
    currentActorRef.current = null;
    vi.spyOn(identityModule, "getActor").mockImplementation(async () => currentActorRef.current);
    catalog = seedStandardCatalog(harness);

    // Grant User A ownership of Book 1 ONLY
    harness.tables.purchase_grants.push({
      id: "grant-user-a-book-1",
      orderItemId: "order-item-user-a-1",
      bookId: catalog.book1.id,
      userId: userA.userId,
      grantedAt: new Date("2026-10-25T10:00:00.000Z"),
      revokedAt: null,
      revokeReason: null,
    });

    // Grant User B ownership of Book 2 ONLY
    harness.tables.purchase_grants.push({
      id: "grant-user-b-book-2",
      orderItemId: "order-item-user-b-2",
      bookId: catalog.book2.id,
      userId: userB.userId,
      grantedAt: new Date("2026-10-25T10:00:00.000Z"),
      revokedAt: null,
      revokeReason: null,
    });
  });

  describe("Paywall Access Guard: Zero Paid HTML Body Bytes for Non-Owners", () => {
    it("User A requests Book 1 ch-2 -> allowed, returns full chapter HTML", async () => {
      const result = await getChapterForReading(
        catalog.book1.slug,
        "ch-2",
        "id",
        "standard",
        userA,
        harness.getDb()
      );

      expect(result).not.toBeNull();
      expect(result?.isAllowed).toBe(true);
      expect(result?.isFreeSample).toBe(false);
      expect(result?.html).toBeDefined();
      expect(result?.html).toContain("Konten rahasia berbayar bab 2");
      expect(result?.previewText).toBeUndefined();
    });

    it("User A requests Book 2 ch-2 -> denied, isAllowed: false, html is strictly undefined, approved preview only", async () => {
      const result = await getChapterForReading(
        catalog.book2.slug,
        "ch-2",
        "id",
        "standard",
        userA,
        harness.getDb()
      );

      expect(result).not.toBeNull();
      expect(result?.isAllowed).toBe(false);
      expect(result?.isFreeSample).toBe(false);

      // STRICT SECURITY CHECK: html must be strictly undefined (not null, not empty string)
      expect(result?.html).toBeUndefined();
      expect("html" in (result || {})).toBe(true);
      expect(result?.previewText).toBeDefined();
      expect(result?.previewText).toContain("Pratinjau resmi bab 2 untuk Napas Panjang Memimpin Tim");

      // Verify that serialized JSON payload contains zero paid bytes
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("Konten rahasia berbayar");
      const parsed = JSON.parse(serialized);
      expect(parsed.html).toBeUndefined();
    });

    it("Anonymous user requests Book 1 ch-0 -> allowed (free sample)", async () => {
      const result = await getChapterForReading(
        catalog.book1.slug,
        "ch-0",
        "id",
        "standard",
        null, // Anonymous
        harness.getDb()
      );

      expect(result).not.toBeNull();
      expect(result?.isAllowed).toBe(true);
      expect(result?.isFreeSample).toBe(true);
      expect(result?.html).toBeDefined();
      expect(result?.html).toContain("Pendahuluan");
      expect(result?.previewText).toBeUndefined();
    });

    it("Anonymous user requests Book 1 ch-2 -> denied, isAllowed: false, html is strictly undefined", async () => {
      const result = await getChapterForReading(
        catalog.book1.slug,
        "ch-2",
        "id",
        "standard",
        null, // Anonymous
        harness.getDb()
      );

      expect(result).not.toBeNull();
      expect(result?.isAllowed).toBe(false);
      expect(result?.isFreeSample).toBe(false);
      expect(result?.html).toBeUndefined();
      expect(result?.previewText).toBeDefined();
      expect(result?.previewText).toContain("Pratinjau resmi bab 2 untuk Mahir Memimpin Tim");

      // Serialized payload check
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("Konten rahasia berbayar");
      expect(JSON.parse(serialized).html).toBeUndefined();
    });

    it("verifies entitlement check canReadChapter matches access guard decisions", async () => {
      // User A (owns Book 1)
      expect(await canReadChapter(userA, catalog.book1.id, 0, harness.getDb())).toBe(true); // free sample
      expect(await canReadChapter(userA, catalog.book1.id, 1, harness.getDb())).toBe(true); // free sample
      expect(await canReadChapter(userA, catalog.book1.id, 2, harness.getDb())).toBe(true); // owned
      expect(await canReadChapter(userA, catalog.book2.id, 2, harness.getDb())).toBe(false); // not owned

      // User B (owns Book 2)
      expect(await canReadChapter(userB, catalog.book1.id, 2, harness.getDb())).toBe(false); // not owned
      expect(await canReadChapter(userB, catalog.book2.id, 2, harness.getDb())).toBe(true); // owned

      // Anonymous
      expect(await canReadChapter(null, catalog.book1.id, 0, harness.getDb())).toBe(true); // free sample
      expect(await canReadChapter(null, catalog.book1.id, 2, harness.getDb())).toBe(false); // not owned
    });
  });

  describe("Anti-Data-Leak Search Gate: Zero Paid Body Bytes in Search", () => {
    it("non-owner query for unique secret keyword in paid chapter 3 returns public preview only (0 paid body bytes)", async () => {
      // User B does NOT own Book 1 (where secretKeyword exists in chapter 3 private text)
      const nonOwnerResult = await searchTopics(secretKeyword, "id", userB, harness.getDb());

      // Because secretKeyword exists ONLY in private text of an unowned chapter:
      // Non-owner search MUST NOT match private text at all!
      expect(nonOwnerResult.total).toBe(0);
      expect(nonOwnerResult.results).toEqual([]);

      // Serialized check
      const serialized = JSON.stringify(nonOwnerResult.results);
      expect(serialized).not.toContain(secretKeyword);
    });

    it("non-owner search for public title/preview terms returns public preview with snippetText strictly undefined", async () => {
      // Query "strategi" matches public title and tags of chapter 3
      const result = await searchTopics("strategi", "id", userB, harness.getDb());

      expect(result.total).toBeGreaterThan(0);
      const ch3Result = result.results.find((r) => r.bookId === catalog.book1.id && r.chapterIndex === 3);

      expect(ch3Result).toBeDefined();
      expect(ch3Result?.isOwned).toBe(false);
      expect(ch3Result?.previewText).toBeDefined();

      // STRICT SECURITY CHECK: snippetText must be strictly undefined for non-owner!
      expect(ch3Result?.snippetText).toBeUndefined();
      expect("snippetText" in (ch3Result || {})).toBe(true);

      // Verify that serialized JSON response contains ZERO secret keyword or paid content bytes
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(secretKeyword);
      expect(serialized).not.toContain("Gunakan rahasia");
    });

    it("owner query for unique secret keyword successfully returns private snippet with highlights", async () => {
      // User A OWNS Book 1
      const ownerResult = await searchTopics(secretKeyword, "id", userA, harness.getDb());

      expect(ownerResult.total).toBe(1);
      const ch3Result = ownerResult.results[0];

      expect(ch3Result.bookId).toBe(catalog.book1.id);
      expect(ch3Result.chapterIndex).toBe(3);
      expect(ch3Result.isOwned).toBe(true);
      expect(ch3Result.snippetText).toBeDefined();
      expect(ch3Result.snippetText).toContain(secretKeyword);
      expect(ch3Result.snippetText).toContain('<mark class="search-highlight">');
      expect(ch3Result.highlights).toContain(secretKeyword);
    });

    it("verifies GET /api/search route enforces non-owner zero paid bytes and private no-store headers", async () => {
      // Anonymous user querying secret keyword via API route
      currentActorRef.current = null;
      const request = new NextRequest(`http://localhost:3000/api/search?q=${secretKeyword}&locale=id`);
      const response = await searchRoute(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");

      const body = await response.json();
      expect(body.total).toBe(0);
      expect(body.results).toEqual([]);

      const serializedResponse = JSON.stringify(body.results);
      expect(serializedResponse).not.toContain(secretKeyword);
    });

    it("verifies SOS shortcut searches enforce snippet access guard", async () => {
      // Query "3K" (targets Book 1 chapter 7)
      // User B does NOT own Book 1:
      const nonOwnerSos = await searchTopics("3K", "id", userB, harness.getDb());
      expect(nonOwnerSos.total).toBe(1);
      const itemB = nonOwnerSos.results[0];
      expect(itemB.isOwned).toBe(false);
      expect(itemB.previewText).toBeDefined();
      expect(itemB.snippetText).toBeUndefined(); // Zero paid snippet for non-owner

      // User A OWNS Book 1:
      const ownerSos = await searchTopics("3K", "id", userA, harness.getDb());
      expect(ownerSos.total).toBe(1);
      const itemA = ownerSos.results[0];
      expect(itemA.isOwned).toBe(true);
      expect(itemA.snippetText).toBeDefined(); // Allowed paid snippet for owner
      expect(itemA.snippetText).toContain('<mark class="search-highlight">3K</mark>');
      expect(itemA.snippetText).toContain("Keluaran, Kriteria Sukses, Kalender");
    });
  });
});
