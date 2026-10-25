import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { purchaseGrants, manualGrants } from "@/shared/db/schema/commerce";
import type { DbOrTx } from "@/shared/jobs/types";
import type { Actor } from "@/modules/identity/types";
import type { CanReadChapterOptions } from "./types";

/**
 * Checks whether a user holds an active (non-revoked, non-expired) grant for a specific book.
 * Checks across purchase_grants and manual_grants.
 */
export async function hasBookGrant(
  userId: string,
  bookId: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<boolean> {
  if (!userId || !bookId) {
    return false;
  }

  // 1. Check purchase_grants (active when revoked_at is null)
  const purchaseQuery = dbOrTx
    .select({ id: purchaseGrants.id })
    .from(purchaseGrants)
    .where(
      and(
        eq(purchaseGrants.userId, userId),
        eq(purchaseGrants.bookId, bookId),
        isNull(purchaseGrants.revokedAt)
      )
    );

  const purchaseRows =
    typeof purchaseQuery.limit === "function"
      ? await purchaseQuery.limit(1)
      : await purchaseQuery;

  if (purchaseRows && purchaseRows.length > 0) {
    return true;
  }

  // 2. Check manual_grants (active when revoked_at is null AND (expires_at is null OR expires_at > now()))
  const now = new Date();
  const manualQuery = dbOrTx
    .select({ id: manualGrants.id })
    .from(manualGrants)
    .where(
      and(
        eq(manualGrants.userId, userId),
        eq(manualGrants.bookId, bookId),
        isNull(manualGrants.revokedAt),
        or(isNull(manualGrants.expiresAt), gt(manualGrants.expiresAt, now))
      )
    );

  const manualRows =
    typeof manualQuery.limit === "function"
      ? await manualQuery.limit(1)
      : await manualQuery;

  return Boolean(manualRows && manualRows.length > 0);
}

/**
 * Determines whether the given actor is permitted to read a specific chapter of a book.
 * - Chapters 0 and 1: free sample (permitted for everyone including anonymous).
 * - Chapters 2..14:
 *   - Anonymous (null actor): false.
 *   - Admin / publisher: true (preview override).
 *   - Regular reader: requires active book grant.
 * - Out-of-bounds (<0 or >14): false.
 */
export async function canReadChapter(
  optionsOrActor: CanReadChapterOptions | Actor | null,
  bookIdOrDb?: string | DbOrTx,
  chapterIndexOrDb?: number | DbOrTx,
  maybeDb?: DbOrTx
): Promise<boolean> {
  let actor: Actor | null = null;
  let bookId = "";
  let chapterIndex = -1;
  let dbOrTx: DbOrTx = defaultDb;

  if (
    optionsOrActor &&
    typeof optionsOrActor === "object" &&
    "chapterIndex" in optionsOrActor &&
    "bookId" in optionsOrActor
  ) {
    const opts = optionsOrActor as CanReadChapterOptions;
    actor = opts.actor;
    bookId = opts.bookId;
    chapterIndex = opts.chapterIndex;
    if (bookIdOrDb && typeof bookIdOrDb === "object") {
      dbOrTx = bookIdOrDb as DbOrTx;
    }
  } else {
    actor = (optionsOrActor as Actor | null) ?? null;
    bookId = typeof bookIdOrDb === "string" ? bookIdOrDb : "";
    chapterIndex = typeof chapterIndexOrDb === "number" ? chapterIndexOrDb : -1;
    if (maybeDb) {
      dbOrTx = maybeDb;
    }
  }

  if (chapterIndex < 0 || chapterIndex > 14) {
    return false;
  }

  if (chapterIndex === 0 || chapterIndex === 1) {
    return true;
  }

  if (!actor) {
    return false;
  }

  if (
    actor.roles &&
    (actor.roles.includes("admin") || actor.roles.includes("publisher"))
  ) {
    return true;
  }

  if (!actor.userId) {
    return false;
  }

  return hasBookGrant(actor.userId, bookId, dbOrTx);
}

/**
 * Returns a deduplicated array of book IDs currently granted to the user.
 */
export async function listUserGrants(
  userId: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<string[]> {
  if (!userId) {
    return [];
  }

  const now = new Date();

  // Active purchase grants
  const purchaseQuery = dbOrTx
    .select({ bookId: purchaseGrants.bookId })
    .from(purchaseGrants)
    .where(
      and(
        eq(purchaseGrants.userId, userId),
        isNull(purchaseGrants.revokedAt)
      )
    );

  const purchaseRows = await purchaseQuery;

  // Active manual grants
  const manualQuery = dbOrTx
    .select({ bookId: manualGrants.bookId })
    .from(manualGrants)
    .where(
      and(
        eq(manualGrants.userId, userId),
        isNull(manualGrants.revokedAt),
        or(isNull(manualGrants.expiresAt), gt(manualGrants.expiresAt, now))
      )
    );

  const manualRows = await manualQuery;

  const bookIdSet = new Set<string>();

  for (const row of purchaseRows ?? []) {
    if (row?.bookId) {
      bookIdSet.add(row.bookId);
    }
  }

  for (const row of manualRows ?? []) {
    if (row?.bookId) {
      bookIdSet.add(row.bookId);
    }
  }

  return Array.from(bookIdSet);
}
