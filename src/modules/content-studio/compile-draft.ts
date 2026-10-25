import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import {
  contentDrafts,
  contentRevisions,
  publishedPreviews,
} from "@/shared/db/schema/content";
import {
  compileChapter,
  defaultConfig,
  type CompilerConfig,
} from "@/content/compiler";
import type { DbOrTx } from "@/shared/jobs/types";
import type { Actor } from "@/modules/identity/types";
import {
  NotFoundError,
  type CompileDraftResult,
  type CompileDraftOptions,
} from "./types";

export async function compileDraft(
  variantId: string,
  dbOrTx?: DbOrTx,
  actorOrOptions?: Actor | (CompileDraftOptions & { config?: Partial<CompilerConfig> })
): Promise<CompileDraftResult> {
  const client = dbOrTx ?? defaultDb;

  let actor: Actor | undefined;
  let customConfig: Partial<CompilerConfig> | undefined;

  if (actorOrOptions) {
    if ("userId" in actorOrOptions) {
      actor = actorOrOptions;
    } else {
      actor = actorOrOptions.actor;
      customConfig = actorOrOptions.config;
    }
  }

  const draftRows = await client
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.variantId, variantId));

  if (!draftRows || draftRows.length === 0) {
    throw new NotFoundError(
      `Draft not found for variant: ${variantId}`,
      "DRAFT_NOT_FOUND"
    );
  }

  const draft = draftRows[0];
  const compileResult = compileChapter(draft.sourceMd, customConfig);

  const revisionId = randomUUID();
  const compilerVersion =
    customConfig?.compilerVersion ?? defaultConfig.compilerVersion;
  const sanitizerVersion =
    customConfig?.sanitizerVersion ?? defaultConfig.sanitizerVersion;
  const now = new Date();

  // Create immutable content_revisions row
  await client.insert(contentRevisions).values({
    id: revisionId,
    variantId,
    sourceMd: draft.sourceMd,
    sourceSha256: compileResult.sourceHash,
    manifestSha256: compileResult.manifestHash,
    compilerVersion,
    sanitizerVersion,
    html: compileResult.html,
    metadataJson: compileResult.metadata,
    createdBy: actor?.userId ?? null,
    createdAt: now,
  });

  // Upsert published_previews with approved preview text and preview html
  const previewHtml = `<div class="chapter-preview">${compileResult.previewText}</div>`;
  await client
    .insert(publishedPreviews)
    .values({
      variantId,
      previewText: compileResult.previewText,
      previewHtml,
      version: 1,
      approvedBy: actor?.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: publishedPreviews.variantId,
      set: {
        previewText: compileResult.previewText,
        previewHtml,
        version: sql`${publishedPreviews.version} + 1`,
        approvedBy: actor?.userId ?? null,
        updatedAt: now,
      },
    });

  return {
    ...compileResult,
    revisionId,
  };
}
