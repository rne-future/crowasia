import { eq, and, asc } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { books, chapters, chapterVariants, pricingTiers, tierBooks } from "@/shared/db/schema/catalog";
import { contentDrafts } from "@/shared/db/schema/content";
import type { DbOrTx } from "@/shared/jobs/types";
import type { BookSummary, BookDetail, BundleOffer, ChapterSummary, BookTierSummary } from "./types";

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

export async function listPublishedBooks(
  locale = "id",
  dbOrTx: DbOrTx = defaultDb
): Promise<BookSummary[]> {
  const publishedBooks = await dbOrTx
    .select()
    .from(books)
    .where(eq(books.status, "published"));

  if (publishedBooks.length === 0) {
    return [];
  }

  const activeTierRows = await dbOrTx
    .select({
      tierId: pricingTiers.id,
      code: pricingTiers.code,
      amountIdr: pricingTiers.amountIdr,
      bookId: tierBooks.bookId,
    })
    .from(tierBooks)
    .innerJoin(pricingTiers, eq(tierBooks.tierId, pricingTiers.id))
    .where(eq(pricingTiers.status, "active"));

  const allChapters = await dbOrTx
    .select({
      id: chapters.id,
      bookId: chapters.bookId,
      index: chapters.index,
    })
    .from(chapters);

  const allVariants = await dbOrTx
    .select({
      chapterId: chapterVariants.chapterId,
      locale: chapterVariants.locale,
    })
    .from(chapterVariants);

  return publishedBooks.map((book) => {
    const bookTiers = activeTierRows.filter((t) => t.bookId === book.id);
    const nonBundleTiers = bookTiers.filter((t) => !t.code.toLowerCase().includes("bundle"));
    const singleTier = nonBundleTiers.length > 0 ? nonBundleTiers[0] : bookTiers[0];
    const activePriceIdr = singleTier?.amountIdr ?? 0n;

    const bChapters = allChapters.filter((c) => c.bookId === book.id);
    const chIds = new Set(bChapters.map((c) => c.id));
    const bVariants = allVariants.filter((v) => chIds.has(v.chapterId));
    const availableLocales = Array.from(new Set(bVariants.map((v) => v.locale)));

    return {
      id: book.id,
      slug: book.slug,
      title: book.title,
      description: book.description ?? undefined,
      activePriceIdr,
      availableLocales: availableLocales.length > 0 ? availableLocales : [locale],
      chaptersCount: bChapters.length,
    };
  });
}

export async function getBookDetail(
  slug: string,
  locale = "id",
  dbOrTx: DbOrTx = defaultDb
): Promise<BookDetail | null> {
  const bookRows = await dbOrTx
    .select()
    .from(books)
    .where(eq(books.slug, slug))
    .limit(1);

  if (!bookRows || bookRows.length === 0) {
    return null;
  }

  const book = bookRows[0];

  const bookChapters = await dbOrTx
    .select()
    .from(chapters)
    .where(eq(chapters.bookId, book.id))
    .orderBy(asc(chapters.index));

  const bookTierRows = await dbOrTx
    .select({
      id: pricingTiers.id,
      code: pricingTiers.code,
      amountIdr: pricingTiers.amountIdr,
    })
    .from(tierBooks)
    .innerJoin(pricingTiers, eq(tierBooks.tierId, pricingTiers.id))
    .where(and(eq(tierBooks.bookId, book.id), eq(pricingTiers.status, "active")));

  const variantRows = await dbOrTx
    .select({
      chapterId: chapterVariants.chapterId,
      locale: chapterVariants.locale,
      identityManifest: contentDrafts.identityManifest,
    })
    .from(chapterVariants)
    .leftJoin(contentDrafts, eq(contentDrafts.variantId, chapterVariants.id))
    .where(eq(chapterVariants.locale, locale));

  const allVariants = await dbOrTx
    .select({
      chapterId: chapterVariants.chapterId,
      locale: chapterVariants.locale,
    })
    .from(chapterVariants);

  const chIds = new Set(bookChapters.map((c) => c.id));
  const bVariants = allVariants.filter((v) => chIds.has(v.chapterId));
  const availableLocales = Array.from(new Set(bVariants.map((v) => v.locale)));

  const nonBundleTiers = bookTierRows.filter((t) => !t.code.toLowerCase().includes("bundle"));
  const singleTier = nonBundleTiers.length > 0 ? nonBundleTiers[0] : bookTierRows[0];
  const activePriceIdr = singleTier?.amountIdr ?? 0n;

  const mappedChapters: ChapterSummary[] = bookChapters.map((ch) => {
    const variant = variantRows.find((v) => v.chapterId === ch.id);
    const manifest = variant?.identityManifest as { title?: string } | undefined;
    const title = manifest?.title || getFallbackChapterTitle(book.slug, ch.index, locale);

    return {
      slug: ch.slug,
      index: ch.index,
      title,
      isFreeSample: ch.index === 0 || ch.index === 1,
    };
  });

  const mappedTiers: BookTierSummary[] = bookTierRows.map((t) => ({
    id: t.id,
    code: t.code,
    amountIdr: t.amountIdr,
  }));

  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description ?? undefined,
    activePriceIdr,
    availableLocales: availableLocales.length > 0 ? availableLocales : [locale],
    chaptersCount: bookChapters.length,
    chapters: mappedChapters,
    tiers: mappedTiers,
  };
}

export async function getBundleOffer(
  dbOrTx: DbOrTx = defaultDb
): Promise<BundleOffer | null> {
  const activeTiers = await dbOrTx
    .select()
    .from(pricingTiers)
    .where(eq(pricingTiers.status, "active"));

  const allTierBooks = await dbOrTx
    .select()
    .from(tierBooks);

  const bundleTier = activeTiers.find((t) => {
    const linked = allTierBooks.filter((tb) => tb.tierId === t.id);
    return t.code.toLowerCase().includes("bundle") || linked.length > 1;
  });

  if (!bundleTier) {
    return null;
  }

  const bookIds = allTierBooks
    .filter((tb) => tb.tierId === bundleTier.id)
    .map((tb) => tb.bookId);

  return {
    tierId: bundleTier.id,
    code: bundleTier.code,
    amountIdr: bundleTier.amountIdr,
    bookIds,
  };
}
