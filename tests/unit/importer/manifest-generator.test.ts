import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  generateManifest,
  loadManifest,
} from "@/content/importer/manifest-generator";

describe("generateManifest", () => {
  it("produces same checklist_item_ids as reference for matching chapters", () => {
    const refManifest = loadManifest("book-1");
    const casualSource = readFileSync("books/id/casual/book-1.md", "utf-8");
    const generated = generateManifest(casualSource, "book-1", refManifest);

    expect(generated.chapters).toHaveLength(15);
    for (const ch of generated.chapters) {
      const refCh = refManifest.chapters.find(
        (r) => r.chapter_slug === ch.chapter_slug
      );
      expect(refCh).toBeDefined();
      expect(ch.checklist_item_ids).toEqual(refCh!.checklist_item_ids);
    }
  });

  it("correctly maps line ranges for different variant", () => {
    const refManifest = loadManifest("book-1");
    const enSource = readFileSync("books/en/book-1.md", "utf-8");
    const generated = generateManifest(enSource, "book-1", refManifest, {
      locale: "en",
      register: "standard",
    });

    const ch3 = generated.chapters.find((c) => c.chapter_slug === "ch-3");
    const refCh3 = refManifest.chapters.find((c) => c.chapter_slug === "ch-3");

    expect(ch3).toBeDefined();
    expect(refCh3).toBeDefined();
    // English variant has line numbers starting at 162 rather than 165
    expect(ch3!.source_start_line).toBe(162);
    expect(refCh3!.source_start_line).toBe(165);
    // But checklist UUIDs must match exactly
    expect(ch3!.checklist_item_ids).toEqual(refCh3!.checklist_item_ids);
  });

  it("flags mismatch if chapter count differs from reference", () => {
    const refManifest = loadManifest("book-1");
    const incompleteSource =
      "## Pendahuluan: Intro\nIntro content\n## Bab 1: Satu\nContent";
    expect(() =>
      generateManifest(incompleteSource, "book-1", refManifest)
    ).toThrow(/chapter count|15 chapters/i);
  });

  it("flags mismatch if checklist item count per chapter differs from reference", () => {
    const refManifest = loadManifest("book-1");
    // Modify ch-3 source to add an extra unexpected checklist item
    const standarSource = readFileSync("books/id/standar/book-1.md", "utf-8");
    const tamperedSource = standarSource.replace(
      "- [ ] **Tahan solusi di 5 menit pertama:**",
      "- [ ] Extra unexpected item\n- [ ] **Tahan solusi di 5 menit pertama:**"
    );

    expect(() =>
      generateManifest(tamperedSource, "book-1", refManifest)
    ).toThrow(/checklist item count mismatch/i);
  });

  it("generates consistent checklist UUIDs across all 9 variants", () => {
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
      const ref = loadManifest(bookId);
      const source = readFileSync(path, "utf-8");
      const generated = generateManifest(source, bookId, ref);

      const totalGenItems = generated.chapters.reduce(
        (sum, ch) => sum + ch.checklist_item_ids.length,
        0
      );
      const totalRefItems = ref.chapters.reduce(
        (sum, ch) => sum + ch.checklist_item_ids.length,
        0
      );

      expect(totalGenItems).toBe(totalRefItems);
      for (let i = 0; i < 15; i++) {
        expect(generated.chapters[i].checklist_item_ids).toEqual(
          ref.chapters[i].checklist_item_ids
        );
      }
    }
  });
});
