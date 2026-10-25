import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "@/shared/db/schema";
import { compileChapter } from "@/content/compiler";
import { splitBook } from "./split-chapters";
import { generateManifest, loadManifest } from "./manifest-generator";
import type { ImportOptions, ImportReport } from "./types";
import type { DbOrTx } from "@/shared/jobs/types";

export * from "./types";
export * from "./split-chapters";
export * from "./manifest-generator";

function resolveSourcePath(
  bookId: string,
  locale: string,
  register: "standard" | "casual",
  explicitPath?: string
): string {
  if (explicitPath) {
    return resolve(process.cwd(), explicitPath);
  }

  if (locale === "id") {
    const regDir = register === "casual" ? "casual" : "standar";
    return resolve(process.cwd(), `books/id/${regDir}/${bookId}.md`);
  }

  return resolve(process.cwd(), `books/${locale}/${bookId}.md`);
}

export async function importBook(
  opts: ImportOptions,
  dbOrTx?: DbOrTx
): Promise<ImportReport> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    let source = opts.sourceContent;
    if (!source) {
      const targetPath = resolveSourcePath(
        opts.bookId,
        opts.locale,
        opts.register,
        opts.sourcePath
      );

      if (!existsSync(targetPath)) {
        errors.push(`Source file not found at ${targetPath}`);
        return {
          bookId: opts.bookId,
          locale: opts.locale,
          register: opts.register,
          chaptersCount: 0,
          checklistItemsCount: 0,
          warnings,
          errors,
        };
      }

      source = readFileSync(targetPath, "utf-8");
    }

    // 1. Split into 15 chapters
    const chapters = splitBook(source, opts.bookId);

    // 2. Load reference manifest and generate variant manifest
    const refManifest = loadManifest(opts.bookId);
    const variantManifest = generateManifest(source, opts.bookId, refManifest, {
      locale: opts.locale,
      register: opts.register,
    });

    // 3. Compile each chapter
    for (const ch of chapters) {
      const compileResult = compileChapter(ch.source);
      if (compileResult.warnings?.length) {
        warnings.push(...compileResult.warnings);
      }
    }

    const checklistItemsCount = variantManifest.chapters.reduce(
      (sum, ch) => sum + ch.checklist_item_ids.length,
      0
    );

    // 4. If not dry run, persist to database
    if (!opts.dryRun) {
      const dbInstance: DbOrTx =
        dbOrTx ?? (await import("@/shared/db/client")).db;

      const persistOperations = async (tx: DbOrTx): Promise<void> => {
        // A. Ensure book exists
        const existingBooks = await tx
          .select()
          .from(schema.books)
          .where(eq(schema.books.slug, opts.bookId))
          .limit(1);

        let bookRecord = existingBooks[0];
        if (!bookRecord) {
          const inserted = await tx
            .insert(schema.books)
            .values({
              slug: opts.bookId,
              title: refManifest.title ?? opts.bookId,
              status: "published",
            })
            .returning();
          bookRecord = inserted[0];
        }

        // B. Process each chapter and chapter variant
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const chManifest = variantManifest.chapters[i];

          // Find or insert chapter
          const existingChapters = await tx
            .select()
            .from(schema.chapters)
            .where(
              and(
                eq(schema.chapters.bookId, bookRecord.id),
                eq(schema.chapters.index, ch.index)
              )
            )
            .limit(1);

          let chapterRecord = existingChapters[0];
          if (!chapterRecord) {
            const insertedChapters = await tx
              .insert(schema.chapters)
              .values({
                bookId: bookRecord.id,
                index: ch.index,
                slug: ch.slug,
                isFreeSample: ch.isFreeSample,
              })
              .returning();
            chapterRecord = insertedChapters[0];
          }

          // Find or insert chapter variant
          const existingVariants = await tx
            .select()
            .from(schema.chapterVariants)
            .where(
              and(
                eq(schema.chapterVariants.chapterId, chapterRecord.id),
                eq(schema.chapterVariants.locale, opts.locale),
                eq(schema.chapterVariants.register, opts.register)
              )
            )
            .limit(1);

          let variantRecord = existingVariants[0];
          if (!variantRecord) {
            const insertedVariants = await tx
              .insert(schema.chapterVariants)
              .values({
                chapterId: chapterRecord.id,
                locale: opts.locale,
                register: opts.register,
                generation: 1,
              })
              .returning();
            variantRecord = insertedVariants[0];
          }

          // Upsert checklist items for this chapter (neutral identity, FK to chapter)
          for (const itemId of chManifest.checklist_item_ids) {
            await tx
              .insert(schema.checklistItems)
              .values({
                id: itemId,
                chapterId: chapterRecord.id,
              })
              .onConflictDoNothing();
          }

          // Upsert content drafts for this variant
          await tx
            .insert(schema.contentDrafts)
            .values({
              variantId: variantRecord.id,
              sourceMd: ch.source,
              identityManifest: chManifest,
              version: 1,
            })
            .onConflictDoUpdate({
              target: schema.contentDrafts.variantId,
              set: {
                sourceMd: ch.source,
                identityManifest: chManifest,
                version: sql`${schema.contentDrafts.version} + 1`,
                updatedAt: new Date(),
              },
            });
        }
      };

      if ("transaction" in dbInstance && typeof dbInstance.transaction === "function") {
        await dbInstance.transaction(persistOperations);
      } else {
        await persistOperations(dbInstance);
      }
    }

    return {
      bookId: opts.bookId,
      locale: opts.locale,
      register: opts.register,
      chaptersCount: chapters.length,
      checklistItemsCount,
      warnings,
      errors,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      bookId: opts.bookId,
      locale: opts.locale,
      register: opts.register,
      chaptersCount: 0,
      checklistItemsCount: 0,
      warnings,
      errors,
    };
  }
}
