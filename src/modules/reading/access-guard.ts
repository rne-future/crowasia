import { eq, and, asc, desc } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { books, chapters, chapterVariants } from "@/shared/db/schema/catalog";
import { contentRevisions, publishedPreviews } from "@/shared/db/schema/content";
import { canReadChapter } from "@/modules/entitlements/grants";
import type { Actor } from "@/modules/identity/types";
import type { DbOrTx } from "@/shared/jobs/types";
import type { ChapterReadPayload, TocItem } from "./types";

/**
 * Extracts Table of Contents (h2 and h3 elements) from compiled HTML.
 * Skips screen-reader headings and footnote markers.
 */
export function extractTocFromHtml(html: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const attrs = match[2];
    const rawTitle = match[3].replace(/<[^>]+>/g, "").trim();

    const idMatch = attrs.match(/id="([^"]+)"/i);
    const id = idMatch
      ? idMatch[1]
      : rawTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

    if (id === "footnote-label" || attrs.includes("sr-only")) {
      continue;
    }

    if (rawTitle) {
      headings.push({ id, title: rawTitle, level });
    }
  }

  return headings;
}

function getFallbackChapterTitle(bookSlug: string, index: number, locale = "id"): string {
  const isEn = locale === "en";
  if (index === 0) {
    return isEn ? "Introduction: Stepping Up" : "Pendahuluan: Saat Pertama Kali Memimpin";
  }
  if (index === 14) {
    return isEn ? "Appendix: Reference Desk" : "Lampiran: Ringkasan Meja Kerja & Rujukan Riset";
  }
  return isEn ? `Chapter ${index}` : `Bab ${index}`;
}

/**
 * Server-side access guard and chapter loader.
 * Loads chapter content, validates reading entitlement via canReadChapter(),
 * and enforces strict anti-data-leak protection (non-owners never receive HTML body bytes).
 */
export async function getChapterForReading(
  bookSlug: string,
  chapterSlug: string,
  locale = "id",
  register = "standard",
  actor?: Actor | null,
  dbOrTx: DbOrTx = defaultDb
): Promise<ChapterReadPayload | null> {
  // 1. Fetch book by slug
  const bookQuery = dbOrTx
    .select()
    .from(books)
    .where(eq(books.slug, bookSlug));

  const bookRows = typeof bookQuery.limit === "function" ? await bookQuery.limit(1) : await bookQuery;
  const book = Array.isArray(bookRows) ? bookRows[0] : null;

  if (!book) {
    return null;
  }

  // 2. Fetch all chapters for book ordered by index asc
  const allChaptersQuery = dbOrTx
    .select()
    .from(chapters)
    .where(eq(chapters.bookId, book.id))
    .orderBy(asc(chapters.index));

  const allChapters = await allChaptersQuery;
  if (!allChapters || allChapters.length === 0) {
    return null;
  }

  // 3. Find current chapter (supports both 'ch-0' and 'chapter-0' and exact slug match)
  const parsedIndexMatch = chapterSlug.match(/^(?:ch|chapter)-(\d+)$/i);
  const targetIndex = parsedIndexMatch ? parseInt(parsedIndexMatch[1], 10) : undefined;

  const currentChapterIndex = allChapters.findIndex(
    (c) =>
      c.slug === chapterSlug ||
      (targetIndex !== undefined && c.index === targetIndex)
  );
  if (currentChapterIndex === -1) {
    return null;
  }

  const currentChapter = allChapters[currentChapterIndex];
  const isFreeSample = currentChapter.index === 0 || currentChapter.index === 1;

  // 4. Check entitlement using the canonical canReadChapter engine
  const isAllowed = await canReadChapter(
    actor ?? null,
    book.id,
    currentChapter.index,
    dbOrTx
  );

  // 5. Query chapter variant
  const variantQuery = dbOrTx
    .select()
    .from(chapterVariants)
    .where(eq(chapterVariants.chapterId, currentChapter.id));

  const variants = await variantQuery;
  const matchingVariant =
    variants.find((v) => v.locale === locale && v.register === register) ??
    variants.find((v) => v.locale === locale) ??
    variants[0];

  // 6. Query content revision if variant exists
  type RevisionRow = typeof contentRevisions.$inferSelect;
  let revision: RevisionRow | null = null;
  if (matchingVariant) {
    if (matchingVariant.publishedRevisionId) {
      const revQuery = dbOrTx
        .select()
        .from(contentRevisions)
        .where(eq(contentRevisions.id, matchingVariant.publishedRevisionId));
      const revRows = typeof revQuery.limit === "function" ? await revQuery.limit(1) : await revQuery;
      revision = Array.isArray(revRows) ? (revRows[0] as RevisionRow) : null;
    }

    if (!revision) {
      const latestQuery = dbOrTx
        .select()
        .from(contentRevisions)
        .where(eq(contentRevisions.variantId, matchingVariant.id));
      const orderedQuery =
        typeof latestQuery.orderBy === "function"
          ? latestQuery.orderBy(desc(contentRevisions.createdAt))
          : latestQuery;
      const latestRows =
        typeof orderedQuery.limit === "function" ? await orderedQuery.limit(1) : await orderedQuery;
      revision = Array.isArray(latestRows) ? (latestRows[0] as RevisionRow) : null;
    }
  }

  // 7. Derive chapter title
  const metaObj = revision?.metadataJson as Record<string, unknown> | null | undefined;
  const metaTitle = metaObj?.title;
  let derivedTitle = typeof metaTitle === "string" ? metaTitle : undefined;
  if (!derivedTitle && revision?.html) {
    const h1Match = revision.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      derivedTitle = h1Match[1].replace(/<[^>]+>/g, "").trim();
    }
  }
  const chapterTitle = derivedTitle || getFallbackChapterTitle(book.slug, currentChapter.index, locale);

  // 8. Build navigation (prev and next)
  const prevChapter = currentChapterIndex > 0 ? allChapters[currentChapterIndex - 1] : undefined;
  const nextChapter = currentChapterIndex < allChapters.length - 1 ? allChapters[currentChapterIndex + 1] : undefined;

  const navigation = {
    prev: prevChapter
      ? {
          slug: prevChapter.slug,
          title: getFallbackChapterTitle(book.slug, prevChapter.index, locale),
          index: prevChapter.index,
        }
      : undefined,
    next: nextChapter
      ? {
          slug: nextChapter.slug,
          title: getFallbackChapterTitle(book.slug, nextChapter.index, locale),
          index: nextChapter.index,
        }
      : undefined,
  };

  // 9. If allowed: return full payload with compiled HTML
  if (isAllowed) {
    const html = revision?.html ?? "";
    const toc = extractTocFromHtml(html);

    return {
      bookId: book.id,
      bookSlug: book.slug,
      bookTitle: book.title,
      chapterSlug: currentChapter.slug,
      chapterIndex: currentChapter.index,
      chapterTitle,
      locale,
      register,
      isFreeSample,
      isAllowed: true,
      html,
      previewText: undefined,
      toc,
      navigation,
    };
  }

  // 10. If NOT allowed: ANTI-DATA-LEAK GUARD
  // Load approved preview from published_previews, omit html completely
  let previewText: string | undefined;
  if (matchingVariant) {
    const previewQuery = dbOrTx
      .select()
      .from(publishedPreviews)
      .where(eq(publishedPreviews.variantId, matchingVariant.id));
    const previewRows = typeof previewQuery.limit === "function" ? await previewQuery.limit(1) : await previewQuery;
    const preview = Array.isArray(previewRows) ? previewRows[0] : null;
    if (preview?.previewText) {
      previewText = preview.previewText;
    }
  }

  if (!previewText) {
    previewText = `${chapterTitle} — Bab ini terkunci. Dapatkan akses penuh dengan membeli buku ini untuk membaca seluruh panduan praktis dan skrip percakapan.`;
  }

  const toc = revision?.html ? extractTocFromHtml(revision.html) : [];

  return {
    bookId: book.id,
    bookSlug: book.slug,
    bookTitle: book.title,
    chapterSlug: currentChapter.slug,
    chapterIndex: currentChapter.index,
    chapterTitle,
    locale,
    register,
    isFreeSample: false,
    isAllowed: false,
    html: undefined, // CRITICAL: strictly undefined to prevent data leaks
    previewText,
    toc,
    navigation,
  };
}
