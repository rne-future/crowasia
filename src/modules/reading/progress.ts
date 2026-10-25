import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { readingProgress } from "@/shared/db/schema/reading";
import { books } from "@/shared/db/schema/catalog";
import type { DbOrTx } from "@/shared/jobs/types";
import type { ReadingProgressDto } from "./types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveBookId(bookIdOrSlug: string, dbOrTx: DbOrTx): Promise<string> {
  if (UUID_REGEX.test(bookIdOrSlug)) {
    return bookIdOrSlug;
  }

  const query = dbOrTx
    .select({ id: books.id })
    .from(books)
    .where(eq(books.slug, bookIdOrSlug));

  const rows =
    typeof query.limit === "function" ? await query.limit(1) : await query;

  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].id;
  }

  return bookIdOrSlug;
}

/**
 * Retrieves the current reading progress for a user and book.
 * Returns null if no progress has been recorded.
 */
export async function getReadingProgress(
  userId: string,
  bookId: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<ReadingProgressDto | null> {
  const resolvedBookId = await resolveBookId(bookId, dbOrTx);

  const query = dbOrTx
    .select({
      userId: readingProgress.userId,
      bookId: readingProgress.bookId,
      chapterId: readingProgress.chapterId,
      revisionId: readingProgress.revisionId,
      anchorId: readingProgress.anchorId,
      lastSeenAt: readingProgress.lastSeenAt,
    })
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.bookId, resolvedBookId)
      )
    );

  const rows =
    typeof query.limit === "function" ? await query.limit(1) : await query;

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return null;
  }

  return {
    userId: row.userId,
    bookId: row.bookId,
    chapterId: row.chapterId,
    revisionId: row.revisionId ?? undefined,
    anchorId: row.anchorId ?? undefined,
    lastSeenAt: row.lastSeenAt,
  };
}

export type UpdateReadingProgressOptions = {
  anchorId?: string;
  revisionId?: string;
};

/**
 * Upserts a user's reading progress for a book.
 * Updates chapter_id, revision_id, anchor_id, and last_seen_at.
 * Supports positional (anchorId, revisionId) or options object { anchorId, revisionId }.
 */
export async function updateReadingProgress(
  userId: string,
  bookId: string,
  chapterId: string,
  anchorId?: string | UpdateReadingProgressOptions,
  revisionId?: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<void> {
  let resolvedAnchorId: string | undefined;
  let resolvedRevisionId: string | undefined;
  let resolvedDbOrTx: DbOrTx = dbOrTx;

  if (typeof anchorId === "object" && anchorId !== null) {
    resolvedAnchorId = anchorId.anchorId;
    resolvedRevisionId = anchorId.revisionId;
    if (revisionId && typeof revisionId !== "string") {
      resolvedDbOrTx = revisionId as unknown as DbOrTx;
    }
  } else {
    resolvedAnchorId = anchorId;
    resolvedRevisionId = revisionId;
  }

  const resolvedBookId = await resolveBookId(bookId, resolvedDbOrTx);
  const now = new Date();

  await resolvedDbOrTx
    .insert(readingProgress)
    .values({
      userId,
      bookId: resolvedBookId,
      chapterId,
      revisionId: resolvedRevisionId ?? null,
      anchorId: resolvedAnchorId ?? null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: {
        chapterId,
        revisionId: resolvedRevisionId ?? null,
        anchorId: resolvedAnchorId ?? null,
        lastSeenAt: now,
      },
    });
}
