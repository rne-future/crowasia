import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync, globSync } from "node:fs";
import { basename } from "node:path";
import { compileChapter, defaultConfig } from "@/content/compiler";
import { splitBook } from "@/content/importer/split-chapters";
import { loadManifest } from "@/content/importer/manifest-generator";

describe("golden fixtures — full manuscript compilation", () => {
  const hasBooks = existsSync("books/id/standar/book-1.md");

  it.skipIf(!hasBooks)(
    "book-1 id/standar: 15 chapters, correct checklist counts per chapter",
    () => {
      const source = readFileSync("books/id/standar/book-1.md", "utf-8");
      const chapters = splitBook(source, "book-1");
      expect(chapters).toHaveLength(15);

      const refManifest = loadManifest("book-1");
      // ch-0, ch-1: 0 checklist items (free, no tasks per ACC-23)
      expect(refManifest.chapters[0].checklist_item_ids).toHaveLength(0);
      expect(refManifest.chapters[1].checklist_item_ids).toHaveLength(0);
      expect(refManifest.chapters[3].checklist_item_ids).toHaveLength(3);

      // Verify checklist counts per chapter
      for (let i = 0; i < chapters.length; i++) {
        const ch = compileChapter(chapters[i].source, defaultConfig);
        expect(ch.metadata.tasksCount).toBe(
          refManifest.chapters[i].checklist_item_ids.length
        );
      }

      // Verify content preservation in chapter 3
      const ch3 = compileChapter(chapters[3].source, defaultConfig);
      expect(ch3.html).toContain("Tahan solusi di 5 menit pertama");
      expect(ch3.html).toContain("Ulangi inti cerita minimal 1 kali");
      expect(ch3.html).toContain("Beri jeda 3 detik setelah mereka selesai berbicara");
      expect(ch3.html).toContain("Bab 3: Keterampilan 1: Menyimak Sampai Paham");
    }
  );

  it.skipIf(!hasBooks)(
    "all 9 variants × 15 chapters compile without error",
    () => {
      const files = globSync("books/**/*.md");
      expect(files).toHaveLength(9);

      for (const file of files) {
        const bookId = basename(file, ".md");
        const content = readFileSync(file, "utf-8");
        const chapters = splitBook(content, bookId);
        expect(chapters).toHaveLength(15);

        for (const ch of chapters) {
          const result = compileChapter(ch.source, defaultConfig);
          expect(result.warnings.filter((w) => !w.includes("</br>"))).toEqual([]);
          expect(result.html.length).toBeGreaterThan(0);
        }
      }
    }
  );

  it("malicious fixture: all injection attempts neutralized", () => {
    const source = readFileSync("tests/fixtures/compiler/malicious.md", "utf-8");
    const result = compileChapter(source, defaultConfig);

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("<iframe");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("foreignObject");
    expect(result.html).toContain("Safe alert"); // NOTE alert survives
  });

  it.skipIf(!hasBooks)("compiler output is deterministic", () => {
    const source = readFileSync("books/id/standar/book-1.md", "utf-8");
    const chapters = splitBook(source, "book-1");
    const a = compileChapter(chapters[3].source, defaultConfig);
    const b = compileChapter(chapters[3].source, defaultConfig);

    expect(a.html).toBe(b.html);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.manifestHash).toBe(b.manifestHash);
  });

  it.skipIf(!hasBooks)(
    "</br> normalization preserves surrounding text",
    () => {
      // From actual manuscripts: line 3 has </br>
      const source = readFileSync("books/id/standar/book-1.md", "utf-8");
      const frontmatter = source.split(/\r?\n/).slice(0, 7).join("\n");
      const result = compileChapter(frontmatter, defaultConfig);

      expect(result.warnings.some((w) => w.includes("</br>"))).toBe(true);
      expect(result.html).toContain("Ditulis oleh:");
      expect(result.html).toContain("aiossan");
      expect(result.html).toContain("Ragam Bahasa:");
      expect(result.html).toContain("Saya/Kamu");
      expect(result.html).toMatch(/<br\s*\/?>/);
      expect(result.html).not.toContain("</br>");

      // Also check chapter 2 of casual book-1 which contains </br> in body
      const casualSource = readFileSync("books/id/casual/book-1.md", "utf-8");
      const casualChapters = splitBook(casualSource, "book-1");
      const ch2 = compileChapter(casualChapters[2].source, defaultConfig);

      expect(ch2.warnings.some((w) => w.includes("</br>"))).toBe(true);
      expect(ch2.html).toContain("1. Menyepakati Target di Awal (Rumus 3K)");
      expect(ch2.html).not.toContain("</br>");
    }
  );

  it.skipIf(!hasBooks)(
    "<mark>, <kbd>, <abbr>, footnotes preserved in output",
    () => {
      // book-1 ch-0 line 39 has <mark>, ch-3 has <kbd>
      const source = readFileSync("books/id/standar/book-1.md", "utf-8");
      const chapters = splitBook(source, "book-1");

      const ch0 = compileChapter(chapters[0].source, defaultConfig);
      expect(ch0.html).toContain("<mark>");
      expect(ch0.html).toContain("Hampir semua pemimpin tim baru pernah melewati fase ini.");
      expect(ch0.html).toContain("<abbr");
      expect(ch0.html).toContain("Center for Creative Leadership");
      expect(ch0.html).toContain("CCL</abbr>");
      // Footnote reference text is preserved in ch0
      expect(ch0.html).toContain("[^1]");

      const ch3 = compileChapter(chapters[3].source, defaultConfig);
      expect(ch3.html).toContain("<kbd>");
      expect(ch3.html).toContain("<kbd>Ctrl</kbd>");

      // Footnotes defined in chapter 14 (Lampiran) are parsed and counted
      const ch14 = compileChapter(chapters[14].source, defaultConfig);
      expect(ch14.metadata.footnotesCount).toBeGreaterThan(0);
      expect(ch14.html).toContain("Center for Creative Leadership (CCL)");
    }
  );

  it("golden fixture snapshot matches expected HTML", () => {
    const fixturePath = "tests/fixtures/golden/book-1-ch-3-id-standar.md";
    const expectedPath = "tests/fixtures/golden/expected/book-1-ch-3-id-standar.html";

    // Ensure fixture exists if running in dev with books/
    if (!existsSync(fixturePath) && hasBooks) {
      const source = readFileSync("books/id/standar/book-1.md", "utf-8");
      const chapters = splitBook(source, "book-1");
      mkdirSync("tests/fixtures/golden", { recursive: true });
      writeFileSync(fixturePath, chapters[3].source, "utf-8");
    }

    const fixtureContent = readFileSync(fixturePath, "utf-8");
    const result = compileChapter(fixtureContent, defaultConfig);

    if (!existsSync(expectedPath) && hasBooks) {
      mkdirSync("tests/fixtures/golden/expected", { recursive: true });
      writeFileSync(expectedPath, result.html, "utf-8");
    }

    const expectedHtml = readFileSync(expectedPath, "utf-8");
    expect(result.html).toBe(expectedHtml);
  });
});
