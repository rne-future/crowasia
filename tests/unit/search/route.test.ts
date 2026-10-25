import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/search/route";
import * as searchService from "@/modules/search/service";
import * as getActorModule from "@/modules/identity/get-actor";

describe("Search API Route (GET /api/search)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search results with Cache-Control: private, no-store", async () => {
    vi.spyOn(getActorModule, "getActor").mockResolvedValue(null);
    vi.spyOn(searchService, "searchTopics").mockResolvedValue({
      query: "3K",
      locale: "id",
      total: 1,
      results: [
        {
          bookId: "b1",
          bookSlug: "book-1",
          bookTitle: "Mahir Memimpin Tim",
          chapterSlug: "chapter-7",
          chapterIndex: 7,
          chapterTitle: "Obrolan 1: Menyepakati Target di Awal (Rumus 3K)",
          isFreeSample: false,
          isOwned: false,
          previewText: "Preview text",
          snippetText: undefined,
          highlights: ["3K"],
          href: "/id/read/book-1/chapter-7",
        },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/search?q=3K&locale=id");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.results[0].bookSlug).toBe("book-1");
  });

  it("returns empty results for query with fewer than 2 characters", async () => {
    const request = new NextRequest("http://localhost:3000/api/search?q=a&locale=id");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const data = await response.json();
    expect(data.total).toBe(0);
    expect(data.results).toEqual([]);
  });

  it("returns 400 Bad Request for query exceeding 120 characters", async () => {
    const longQ = "x".repeat(121);
    const request = new NextRequest(`http://localhost:3000/api/search?q=${longQ}`);
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const data = await response.json();
    expect(data.error).toContain("120");
  });

  it("limits results to a maximum of 20 items", async () => {
    const mockItems = Array.from({ length: 25 }, (_, i) => ({
      bookId: `b-${i}`,
      bookSlug: `book-${i}`,
      bookTitle: `Book ${i}`,
      chapterSlug: `chapter-${i}`,
      chapterIndex: i,
      chapterTitle: `Chapter ${i}`,
      isFreeSample: false,
      isOwned: true,
      previewText: "preview",
      snippetText: "snippet",
      highlights: ["test"],
      href: `/id/read/book-${i}/chapter-${i}`,
    }));

    vi.spyOn(getActorModule, "getActor").mockResolvedValue(null);
    vi.spyOn(searchService, "searchTopics").mockResolvedValue({
      query: "test",
      locale: "id",
      total: 25,
      results: mockItems,
    });

    const request = new NextRequest("http://localhost:3000/api/search?q=test&locale=id");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results.length).toBe(20);
    expect(data.total).toBe(20);
  });
});
