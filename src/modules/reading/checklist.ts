import { eq, and, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { checklistItems, checklistProgress } from "@/shared/db/schema/reading";
import type { DbOrTx } from "@/shared/jobs/types";
import {
  type ChecklistProgressResult,
  NotFoundError,
  GoneError,
  ProgressConflictError,
} from "./types";

/**
 * Retrieves the current checklist completion status and CAS version
 * for a list of checklist item IDs for a given user.
 */
export async function getChecklistProgress(
  userId: string,
  itemIds: string[],
  dbOrTx: DbOrTx = defaultDb
): Promise<Map<string, { completed: boolean; version: number }>> {
  const result = new Map<string, { completed: boolean; version: number }>();

  if (!itemIds || itemIds.length === 0) {
    return result;
  }

  const rows = await dbOrTx
    .select({
      itemId: checklistProgress.itemId,
      completed: checklistProgress.completed,
      version: checklistProgress.version,
    })
    .from(checklistProgress)
    .where(
      and(
        eq(checklistProgress.userId, userId),
        inArray(checklistProgress.itemId, itemIds)
      )
    );

  for (const row of rows) {
    result.set(row.itemId, {
      completed: row.completed,
      version: row.version,
    });
  }

  return result;
}

/**
 * Updates a user's checklist progress using atomic Compare-And-Swap (CAS) versioning.
 *
 * Rules:
 * 1. Validates that itemId exists in `checklist_items`. Throws NotFoundError (404) if absent.
 * 2. Checks if item is retired (`retired_at IS NOT NULL`). Throws GoneError (410) if retired.
 * 3. If no progress record exists yet:
 *    - Requires expectedVersion === 0. Throws ProgressConflictError (409) if expectedVersion !== 0.
 *    - Inserts initial record with version = 1.
 * 4. If progress record exists:
 *    - Requires existing.version === expectedVersion. Throws ProgressConflictError (409) on mismatch.
 *    - Updates record with completed and atomic version increment (version + 1).
 */
export async function updateChecklistProgress(
  userId: string,
  itemId: string,
  completed: boolean,
  expectedVersion: number,
  dbOrTx: DbOrTx = defaultDb
): Promise<ChecklistProgressResult> {
  // 1. Verify item existence in checklist_items
  const itemQuery = dbOrTx
    .select({
      id: checklistItems.id,
      retiredAt: checklistItems.retiredAt,
    })
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId));

  const itemRows =
    typeof itemQuery.limit === "function"
      ? await itemQuery.limit(1)
      : await itemQuery;

  const item = Array.isArray(itemRows) ? itemRows[0] : null;
  if (!item) {
    throw new NotFoundError("Item not found", 404);
  }

  // 2. Check retirement status
  if (item.retiredAt !== null && item.retiredAt !== undefined) {
    throw new GoneError("Item is retired", "ITEM_RETIRED");
  }

  // 3. Query existing progress record
  const progressQuery = dbOrTx
    .select({
      completed: checklistProgress.completed,
      version: checklistProgress.version,
      updatedAt: checklistProgress.updatedAt,
    })
    .from(checklistProgress)
    .where(
      and(
        eq(checklistProgress.userId, userId),
        eq(checklistProgress.itemId, itemId)
      )
    );

  const progressRows =
    typeof progressQuery.limit === "function"
      ? await progressQuery.limit(1)
      : await progressQuery;

  const existing = Array.isArray(progressRows) ? progressRows[0] : null;

  const now = new Date();

  // 4. Case: No existing record (initial insert)
  if (!existing) {
    if (expectedVersion !== 0) {
      throw new ProgressConflictError("PROGRESS_CONFLICT", 409, {
        completed: false,
        version: 0,
      });
    }

    const insertQuery = dbOrTx
      .insert(checklistProgress)
      .values({
        userId,
        itemId,
        completed,
        version: 1,
        updatedAt: now,
      });

    if (typeof insertQuery.returning === "function") {
      const inserted = await insertQuery.returning();
      const row = Array.isArray(inserted) ? inserted[0] : null;
      return {
        itemId,
        completed: row?.completed ?? completed,
        version: row?.version ?? 1,
        updatedAt: row?.updatedAt ?? now,
      };
    }

    await insertQuery;
    return {
      itemId,
      completed,
      version: 1,
      updatedAt: now,
    };
  }

  // 5. Case: Existing record (CAS update)
  if (existing.version !== expectedVersion) {
    throw new ProgressConflictError("PROGRESS_CONFLICT", 409, {
      completed: existing.completed,
      version: existing.version,
    });
  }

  const updateQuery = dbOrTx
    .update(checklistProgress)
    .set({
      completed,
      version: sql`${checklistProgress.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(checklistProgress.userId, userId),
        eq(checklistProgress.itemId, itemId),
        eq(checklistProgress.version, expectedVersion)
      )
    );

  if (typeof updateQuery.returning === "function") {
    const updatedRows = await updateQuery.returning();
    if (Array.isArray(updatedRows)) {
      if (updatedRows.length === 0) {
        // Concurrent update intervened between select and update
        throw new ProgressConflictError("PROGRESS_CONFLICT", 409, {
          completed: existing.completed,
          version: existing.version,
        });
      }
      const updatedRow = updatedRows[0];
      return {
        itemId,
        completed: updatedRow.completed,
        version: updatedRow.version,
        updatedAt: updatedRow.updatedAt,
      };
    }
  }

  await updateQuery;
  return {
    itemId,
    completed,
    version: expectedVersion + 1,
    updatedAt: now,
  };
}
