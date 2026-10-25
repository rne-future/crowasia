import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { splitBook, extractBookMetadata } from "./split-chapters";
import type {
  BookManifest,
  GeneratedManifest,
  ImportManifestFile,
} from "./types";

const CHECKLIST_REGEX = /^\s*-\s*\[[ xX]\]/;

export function loadManifest(
  bookId: string,
  manifestPath?: string
): BookManifest {
  const defaultPath = manifestPath || resolve(process.cwd(), ".agents/context/import-manifest.json");
  if (!existsSync(defaultPath)) {
    throw new Error(`Manifest file not found at ${defaultPath}`);
  }

  const content = readFileSync(defaultPath, "utf-8");
  const file: ImportManifestFile = JSON.parse(content);

  const book = file.books.find((b) => b.book_id === bookId);
  if (!book) {
    throw new Error(`Book manifest for ${bookId} not found in ${defaultPath}`);
  }

  return book;
}

export function generateManifest(
  source: string,
  bookId: string,
  referenceManifest: BookManifest,
  options?: { locale?: string; register?: "standard" | "casual" }
): GeneratedManifest {
  if (referenceManifest.book_id !== bookId) {
    throw new Error(
      `Reference manifest book_id (${referenceManifest.book_id}) does not match requested bookId (${bookId})`
    );
  }

  const chapters = splitBook(source, bookId);

  if (chapters.length !== referenceManifest.chapters.length) {
    throw new Error(
      `Chapter count mismatch for ${bookId}: found ${chapters.length}, reference has ${referenceManifest.chapters.length}`
    );
  }

  const meta = extractBookMetadata(source);
  const sourceSha256 = createHash("sha256").update(source, "utf-8").digest("hex");

  const generatedChapters = chapters.map((ch, idx) => {
    const refCh = referenceManifest.chapters.find(
      (r) => r.chapter_slug === ch.slug
    );
    if (!refCh) {
      throw new Error(`Reference manifest missing chapter slug ${ch.slug}`);
    }

    // Detect checklist items in chapter source
    const chLines = ch.source.split(/\r?\n/);
    const checklistCount = chLines.filter((l) => CHECKLIST_REGEX.test(l)).length;

    if (checklistCount !== refCh.checklist_item_ids.length) {
      throw new Error(
        `Checklist item count mismatch in ${ch.slug}: found ${checklistCount}, expected ${refCh.checklist_item_ids.length}`
      );
    }

    // Map each item ordinal to reference UUID: same ordinal = exact same UUID
    const checklist_item_ids = refCh.checklist_item_ids.slice(0, checklistCount);

    return {
      chapter_slug: ch.slug,
      chapter_index: ch.index,
      title: ch.title,
      source_start_line: ch.startLine,
      source_end_line: ch.endLine,
      is_free_sample: ch.isFreeSample,
      checklist_item_ids,
    };
  });

  return {
    schema_version: 1,
    book_id: bookId,
    source_sha256: sourceSha256,
    locale: options?.locale ?? referenceManifest.locale ?? "id",
    register: options?.register ?? (referenceManifest.register as "standard" | "casual") ?? "standard",
    frontmatter_lines: meta.frontmatterLines,
    toc_lines: meta.tocLines,
    chapters: generatedChapters,
  };
}
