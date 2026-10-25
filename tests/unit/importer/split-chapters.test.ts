import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { splitBook } from "@/content/importer/split-chapters";

describe("splitBook", () => {
  const hasBooks = existsSync("books/id/standar/book-1.md");

  it.skipIf(!hasBooks)("splits book-1 id/standar into exactly 15 chapters (ch-0..ch-14)", () => {
    const source = readFileSync("books/id/standar/book-1.md", "utf-8");
    const chapters = splitBook(source, "book-1");

    expect(chapters).toHaveLength(15);
    expect(chapters[0].slug).toBe("ch-0");
    expect(chapters[0].index).toBe(0);
    expect(chapters[0].title).toContain("Pendahuluan");
    expect(chapters[0].isFreeSample).toBe(true);

    expect(chapters[1].slug).toBe("ch-1");
    expect(chapters[1].index).toBe(1);
    expect(chapters[1].isFreeSample).toBe(true);

    expect(chapters[2].slug).toBe("ch-2");
    expect(chapters[2].index).toBe(2);
    expect(chapters[2].isFreeSample).toBe(false);

    expect(chapters[14].slug).toBe("ch-14");
    expect(chapters[14].index).toBe(14);
    expect(chapters[14].title).toContain("Lampiran");
    expect(chapters[14].isFreeSample).toBe(false);

    // Verify 1-based line numbers match reference
    expect(chapters[0].startLine).toBe(28);
    expect(chapters[0].endLine).toBe(55);
    expect(chapters[1].startLine).toBe(56);
    expect(chapters[14].startLine).toBe(932);
    expect(chapters[14].endLine).toBe(978);
  });

  it.skipIf(!hasBooks)("preserves frontmatter as book-level metadata, not a chapter", () => {
    const source = readFileSync("books/id/standar/book-1.md", "utf-8");
    const chapters = splitBook(source, "book-1");
    expect(chapters[0].title).not.toContain("Mahir Memimpin Tim");
    expect(chapters[0].startLine).toBeGreaterThan(1);
  });

  it.skipIf(!hasBooks)("skips Daftar Isi H2 as chapter but uses links for validation", () => {
    const source = readFileSync("books/id/standar/book-1.md", "utf-8");
    const chapters = splitBook(source, "book-1");
    const slugs = chapters.map((c) => c.slug);
    const titles = chapters.map((c) => c.title);

    expect(slugs).not.toContain("daftar-isi");
    expect(slugs).not.toContain("table-of-contents");
    for (const title of titles) {
      expect(title.toLowerCase()).not.toContain("daftar isi");
      expect(title.toLowerCase()).not.toContain("table of contents");
    }
  });

  it.skipIf(!hasBooks)("ch-14 includes Lampiran + Rujukan + closing content", () => {
    const source = readFileSync("books/id/standar/book-1.md", "utf-8");
    const rawLines = source.split(/\r?\n/);
    const totalLines =
      rawLines.length > 0 && rawLines[rawLines.length - 1] === ""
        ? rawLines.length - 1
        : rawLines.length;
    const chapters = splitBook(source, "book-1");
    const ch14 = chapters[14];

    expect(ch14.source).toContain("## Lampiran");
    expect(ch14.source).toContain("## Rujukan Riset Primer");
    expect(ch14.source).toContain("Catatan Hak Cipta & Penafian Merek Dagang");
    expect(ch14.endLine).toBe(totalLines);
  });

  it.skipIf(!hasBooks)("splits all 9 variants into 15 chapters each", () => {
    const variants = [
      { path: "books/id/standar/book-1.md", bookId: "book-1" },
      { path: "books/id/casual/book-1.md", bookId: "book-1" },
      { path: "books/en/book-1.md", bookId: "book-1" },
      { path: "books/id/standar/book-2.md", bookId: "book-2" },
      { path: "books/id/casual/book-2.md", bookId: "book-2" },
      { path: "books/en/book-2.md", bookId: "book-2" },
      { path: "books/id/standar/book-3.md", bookId: "book-3" },
      { path: "books/id/casual/book-3.md", bookId: "book-3" },
      { path: "books/en/book-3.md", bookId: "book-3" },
    ];

    for (const { path, bookId } of variants) {
      const source = readFileSync(path, "utf-8");
      const chapters = splitBook(source, bookId);
      expect(chapters).toHaveLength(15);
      expect(chapters[0].slug).toBe("ch-0");
      expect(chapters[14].slug).toBe("ch-14");
      expect(chapters[0].isFreeSample).toBe(true);
      expect(chapters[1].isFreeSample).toBe(true);
      expect(chapters[2].isFreeSample).toBe(false);
    }
  });

  it("throws descriptive error when chapter count is not 15", () => {
    const brokenSource = "## Pendahuluan\nSome intro\n## Bab 1: Satu\nChapter 1";
    expect(() => splitBook(brokenSource, "book-1")).toThrow(/15 chapters/i);
  });
});
