import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { chapterVariants } from "@/shared/db/schema/catalog";
import { contentRevisions } from "@/shared/db/schema/content";
import { auditEvents } from "@/shared/db/schema/audit";
import { enqueueOutboxJob } from "@/shared/jobs/outbox-worker";
import { requireRole } from "@/modules/identity/get-actor";
import type { Actor } from "@/modules/identity/types";
import type { DbOrTx } from "@/shared/jobs/types";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type RollbackResult,
} from "./types";

export async function rollbackVariant(
  variantId: string,
  safeRevisionId: string,
  expectedGeneration: number,
  reason: string,
  actor: Actor,
  dbOrTx?: DbOrTx
): Promise<RollbackResult> {
  // 1. Authorize: only publisher or admin can rollback
  requireRole(actor, ["publisher", "admin"]);

  // 2. Validate reason is present and non-empty
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new ValidationError(
      "Rollback reason is required",
      "EMPTY_REASON"
    );
  }
  const cleanReason = reason.trim();

  const client = dbOrTx ?? defaultDb;

  const runWithTransaction = async (tx: DbOrTx): Promise<RollbackResult> => {
    // 3. Lock variant row with FOR UPDATE
    const variantRows = await tx
      .select()
      .from(chapterVariants)
      .where(eq(chapterVariants.id, variantId))
      .for("update");

    if (!variantRows || variantRows.length === 0) {
      throw new NotFoundError(
        `Variant not found: ${variantId}`,
        "VARIANT_NOT_FOUND"
      );
    }

    const variant = variantRows[0];

    // 4. Compare-And-Swap (CAS) guard
    if (variant.generation !== expectedGeneration) {
      throw new ConflictError(
        `Generation conflict for variant ${variantId}: expected ${expectedGeneration}, current is ${variant.generation}`,
        "GENERATION_CONFLICT"
      );
    }

    // 5. Validate safe revision exists and belongs to the same variant
    const revisionRows = await tx
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.id, safeRevisionId));

    if (!revisionRows || revisionRows.length === 0) {
      throw new ValidationError(
        `Safe revision ${safeRevisionId} not found`,
        "REVISION_NOT_FOUND"
      );
    }

    const safeRevision = revisionRows[0];
    if (safeRevision.variantId !== variantId) {
      throw new ValidationError(
        `Revision ${safeRevisionId} does not belong to variant ${variantId}`,
        "REVISION_MISMATCH"
      );
    }

    const previousRevisionId = variant.publishedRevisionId;
    const newGen = variant.generation + 1;
    const rolledBackAt = new Date();

    // 6. Update chapter_variants pointer to safe revision and increment generation
    await tx
      .update(chapterVariants)
      .set({
        publishedRevisionId: safeRevisionId,
        generation: newGen,
        updatedAt: rolledBackAt,
      })
      .where(eq(chapterVariants.id, variantId));

    // 7. Record audit event with explicit reason
    await tx.insert(auditEvents).values({
      action: "rollback_variant",
      aggregateType: "chapter_variant",
      aggregateId: variantId,
      actorId: actor.userId,
      reason: cleanReason,
      safeDiffJson: {
        previousRevisionId,
        rolledBackToRevisionId: safeRevisionId,
        generation: newGen,
        reason: cleanReason,
      },
      createdAt: rolledBackAt,
    });

    // 8. Enqueue outbox job for cache/index invalidation
    await enqueueOutboxJob(tx, {
      kind: "rollback_variant",
      aggregateId: variantId,
      dedupeKey: `rollback-${variantId}-${safeRevisionId}-${newGen}`,
      payload: {
        variantId,
        revisionId: safeRevisionId,
        generation: newGen,
        reason: cleanReason,
      },
    });

    return {
      variantId,
      revisionId: safeRevisionId,
      generation: newGen,
      rolledBackAt,
      reason: cleanReason,
    };
  };

  if ("transaction" in client && typeof client.transaction === "function") {
    return await client.transaction(runWithTransaction);
  }
  return await runWithTransaction(client);
}
