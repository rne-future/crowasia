import { db as defaultDb } from "@/shared/db/client";
import * as schema from "@/shared/db/schema";

export interface SeedResult {
  localesCount: number;
  booksCount: number;
  chaptersCount: number;
  freeChaptersCount: number;
  gatedChaptersCount: number;
  variantsCount: number;
  tiersCount: number;
  tierBooksCount: number;
}

export async function seed(db = defaultDb): Promise<SeedResult> {
  // 1. Locales: id, en + placeholder casual register
  const localeValues = [
    { code: "id", enabled: true, direction: "ltr", fallbackCode: null },
    { code: "en", enabled: true, direction: "ltr", fallbackCode: "id" },
    { code: "id-casual", enabled: false, direction: "ltr", fallbackCode: "id" },
  ];

  for (const loc of localeValues) {
    await db.insert(schema.locales).values(loc).onConflictDoNothing();
  }

  // 2. Books: 3 books (book-1, book-2, book-3)
  const bookValues = [
    { slug: "book-1", title: "Buku 1", description: "Buku Panduan Crow Asia Bagian 1", status: "published" as const },
    { slug: "book-2", title: "Buku 2", description: "Buku Panduan Crow Asia Bagian 2", status: "published" as const },
    { slug: "book-3", title: "Buku 3", description: "Buku Panduan Crow Asia Bagian 3", status: "published" as const },
  ];

  const insertedBooks = await db
    .insert(schema.books)
    .values(bookValues)
    .onConflictDoNothing()
    .returning();

  // If already seeded, query books
  const books =
    insertedBooks.length === 3
      ? insertedBooks
      : await db.select().from(schema.books);

  const book1 = books.find((b) => b.slug === "book-1")!;
  const book2 = books.find((b) => b.slug === "book-2")!;
  const book3 = books.find((b) => b.slug === "book-3")!;

  // 3. Chapters: 45 chapters (15 per book, index 0..14, isFreeSample for 0/1)
  const chapterValues: (typeof schema.chapters.$inferInsert)[] = [];
  for (const book of [book1, book2, book3]) {
    for (let index = 0; index <= 14; index++) {
      chapterValues.push({
        bookId: book.id,
        index,
        slug: `chapter-${index}`,
        isFreeSample: index === 0 || index === 1,
      });
    }
  }

  const insertedChapters = await db
    .insert(schema.chapters)
    .values(chapterValues)
    .onConflictDoNothing()
    .returning();

  const chapters =
    insertedChapters.length === 45
      ? insertedChapters
      : await db.select().from(schema.chapters);

  const freeChapters = chapters.filter((c) => c.isFreeSample);
  const gatedChapters = chapters.filter((c) => !c.isFreeSample);

  // 4. Chapter Variants: 3 locale/register combos per chapter = 9 book-variant streams
  // Combos: (id, standard), (id, casual), (en, standard)
  const variantValues: (typeof schema.chapterVariants.$inferInsert)[] = [];
  for (const chapter of chapters) {
    variantValues.push(
      { chapterId: chapter.id, locale: "id", register: "standard", generation: 1 },
      { chapterId: chapter.id, locale: "id", register: "casual", generation: 1 },
      { chapterId: chapter.id, locale: "en", register: "standard", generation: 1 }
    );
  }

  const insertedVariants = await db
    .insert(schema.chapterVariants)
    .values(variantValues)
    .onConflictDoNothing()
    .returning();

  const variants =
    insertedVariants.length === variantValues.length
      ? insertedVariants
      : await db.select().from(schema.chapterVariants);

  // 5. Pricing Tiers: 4 tiers (59000, 79000, 99000, 149000 IDR)
  const tierValues = [
    { code: "tier-book-1", amountIdr: 59000n, status: "active" as const, version: 1, termsVersion: "v1.0" },
    { code: "tier-book-2", amountIdr: 79000n, status: "active" as const, version: 1, termsVersion: "v1.0" },
    { code: "tier-book-3", amountIdr: 99000n, status: "active" as const, version: 1, termsVersion: "v1.0" },
    { code: "tier-bundle", amountIdr: 149000n, status: "active" as const, version: 1, termsVersion: "v1.0" },
  ];

  const insertedTiers = await db
    .insert(schema.pricingTiers)
    .values(tierValues)
    .onConflictDoNothing()
    .returning();

  const tiers =
    insertedTiers.length === 4
      ? insertedTiers
      : await db.select().from(schema.pricingTiers);

  const tier1 = tiers.find((t) => t.code === "tier-book-1")!;
  const tier2 = tiers.find((t) => t.code === "tier-book-2")!;
  const tier3 = tiers.find((t) => t.code === "tier-book-3")!;
  const tierBundle = tiers.find((t) => t.code === "tier-bundle")!;

  // 6. Tier-Books linkages
  const tierBookValues = [
    { tierId: tier1.id, bookId: book1.id },
    { tierId: tier2.id, bookId: book2.id },
    { tierId: tier3.id, bookId: book3.id },
    { tierId: tierBundle.id, bookId: book1.id },
    { tierId: tierBundle.id, bookId: book2.id },
    { tierId: tierBundle.id, bookId: book3.id },
  ];

  await db
    .insert(schema.tierBooks)
    .values(tierBookValues)
    .onConflictDoNothing();

  return {
    localesCount: localeValues.length,
    booksCount: books.length,
    chaptersCount: chapters.length,
    freeChaptersCount: freeChapters.length,
    gatedChaptersCount: gatedChapters.length,
    variantsCount: variants.length,
    tiersCount: tiers.length,
    tierBooksCount: tierBookValues.length,
  };
}

// Auto-run if executed directly
if (process.argv[1]?.includes("scripts/seed.ts")) {
  seed()
    .then((result) => {
      console.log("Database seeded successfully:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
