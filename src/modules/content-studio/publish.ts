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
  type PublishResult,
} from "./types";

export async function publishVariant(
  variantId: string,
  revisionId: string,
  expectedGeneration: number,
  actor: Actor,
  dbOrTx?: DbOrTx
): Promise<PublishResult> {
  // 1. Authorize: only publisher or admin can publish
  requireRole(actor, ["publisher", "admin"]);

  const client = dbOrTx ?? defaultDb;

  const runWithTransaction = async (tx: DbOrTx): Promise<PublishResult> => {
    // 2. Lock variant row with FOR UPDATE
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

    // 3. Compare-And-Swap (CAS) guard
    if (variant.generation !== expectedGeneration) {
      throw new ConflictError(
        `Generation conflict for variant ${variantId}: expected ${expectedGeneration}, current is ${variant.generation}`,
        "GENERATION_CONFLICT"
      );
    }

    // 4. Validate revision exists and belongs to the same variant
    const revisionRows = await tx
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.id, revisionId));

    if (!revisionRows || revisionRows.length === 0) {
      throw new ValidationError(
        `Revision ${revisionId} not found`,
        "REVISION_NOT_FOUND"
      );
    }

    const revision = revisionRows[0];
    if (revision.variantId !== variantId) {
      throw new ValidationError(
        `Revision ${revisionId} does not belong to variant ${variantId}`,
        "REVISION_MISMATCH"
      );
    }

    const previousRevisionId = variant.publishedRevisionId;
    const newGen = variant.generation + 1;
    const publishedAt = new Date();

    // 5. Update chapter_variants with new revision pointer and incremented generation
    await tx
      .update(chapterVariants)
      .set({
        publishedRevisionId: revisionId,
        generation: newGen,
        updatedAt: publishedAt,
      })
      .where(eq(chapterVariants.id, variantId));

    // 6. Record audit event
    await tx.insert(auditEvents).values({
      action: "publish_variant",
      aggregateType: "chapter_variant",
      aggregateId: variantId,
      actorId: actor.userId,
      safeDiffJson: {
        previousRevisionId,
        newRevisionId: revisionId,
        generation: newGen,
      },
      createdAt: publishedAt,
    });

    // 7. Enqueue outbox job for cache/index invalidation
    await enqueueOutboxJob(tx, {
      kind: "publish_variant",
      aggregateId: variantId,
      dedupeKey: `publish-${variantId}-${revisionId}-${newGen}`,
      payload: {
        variantId,
        revisionId,
        generation: newGen,
      },
    });

    return {
      variantId,
      revisionId,
      generation: newGen,
      publishedAt,
    };
  };

  if ("transaction" in client && typeof client.transaction === "function") {
    return await client.transaction(runWithTransaction);
  }
  return await runWithTransaction(client);
}
