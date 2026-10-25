import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  publishVariant,
  rollbackVariant,
  compileDraft,
  ConflictError,
  NotFoundError,
  ValidationError,
  type PublishResult,
  type RollbackResult,
} from "@/modules/content-studio";
import { ForbiddenError, type Actor } from "@/modules/identity/types";
import { chapterVariants } from "@/shared/db/schema/catalog";
import { contentDrafts, contentRevisions, publishedPreviews } from "@/shared/db/schema/content";
import { auditEvents } from "@/shared/db/schema/audit";
import { enqueueOutboxJob } from "@/shared/jobs/outbox-worker";

vi.mock("@/shared/jobs/outbox-worker", () => ({
  enqueueOutboxJob: vi.fn().mockResolvedValue(undefined),
}));

describe("Content Studio Module", () => {
  const publisherActor: Actor = {
    userId: "actor-publisher-123",
    verifiedEmail: "publisher@crowasia.test",
    roles: ["publisher"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const adminActor: Actor = {
    userId: "actor-admin-456",
    verifiedEmail: "admin@crowasia.test",
    roles: ["admin"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const editorActor: Actor = {
    userId: "actor-editor-789",
    verifiedEmail: "editor@crowasia.test",
    roles: ["editor"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  const variantId = "11111111-1111-1111-1111-111111111111";
  const otherVariantId = "22222222-2222-2222-2222-222222222222";
  const revisionId = "33333333-3333-3333-3333-333333333333";
  const safeRevisionId = "44444444-4444-4444-4444-444444444444";
  const foreignRevisionId = "55555555-5555-5555-5555-555555555555";

  let mockVariantState: any;
  let mockDraftsState: any[];
  let mockRevisionsState: any[];
  let mockPreviewsState: any[];
  let mockAuditEventsState: any[];
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVariantState = {
      id: variantId,
      chapterId: "chapter-1",
      locale: "id",
      register: "standard",
      publishedRevisionId: safeRevisionId,
      generation: 3,
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
      updatedAt: new Date("2026-10-20T00:00:00.000Z"),
    };

    mockDraftsState = [
      {
        variantId,
        sourceMd: "# Bab 1: Memimpin Diri Sendiri\n\n> [!NOTE] Penting\n> Selalu mulai dari diri sendiri.\n\nKonten bab 1 yang mendalam.",
        identityManifest: {},
        version: 2,
        updatedBy: publisherActor.userId,
        updatedAt: new Date("2026-10-25T08:00:00.000Z"),
      },
    ];

    mockRevisionsState = [
      {
        id: safeRevisionId,
        variantId,
        sourceMd: "# Safe Revision",
        sourceSha256: "safe-sha-256",
        manifestSha256: "safe-manifest-sha",
        compilerVersion: "1.0.0",
        sanitizerVersion: "1.0.0",
        html: "<h1>Safe Revision</h1>",
        metadataJson: {},
        createdBy: publisherActor.userId,
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
      },
      {
        id: revisionId,
        variantId,
        sourceMd: "# New Candidate Revision",
        sourceSha256: "new-sha-256",
        manifestSha256: "new-manifest-sha",
        compilerVersion: "1.0.0",
        sanitizerVersion: "1.0.0",
        html: "<h1>New Candidate Revision</h1>",
        metadataJson: {},
        createdBy: publisherActor.userId,
        createdAt: new Date("2026-10-25T00:00:00.000Z"),
      },
      {
        id: foreignRevisionId,
        variantId: otherVariantId, // belongs to a different variant
        sourceMd: "# Foreign Revision",
        sourceSha256: "foreign-sha",
        manifestSha256: "foreign-manifest",
        compilerVersion: "1.0.0",
        sanitizerVersion: "1.0.0",
        html: "<h1>Foreign</h1>",
        metadataJson: {},
        createdBy: publisherActor.userId,
        createdAt: new Date("2026-10-25T00:00:00.000Z"),
      },
    ];

    mockPreviewsState = [];
    mockAuditEventsState = [];

    // Construct a flexible mock DB / transaction object
    const createMockClient = () => {
      const client: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockImplementation((condition) => {
              const resolveQuery = () => {
                if (table === chapterVariants || table?.[Symbol.for("drizzle:Name")] === "chapter_variants") {
                  return mockVariantState ? [{ ...mockVariantState }] : [];
                }
                if (table === contentDrafts || table?.[Symbol.for("drizzle:Name")] === "content_drafts") {
                  return mockDraftsState.map((d) => ({ ...d }));
                }
                if (table === contentRevisions || table?.[Symbol.for("drizzle:Name")] === "content_revisions") {
                  // Find ID from condition
                  let matchedId: string | undefined;
                  const extractId = (obj: any) => {
                    if (!obj) return;
                    if (typeof obj === "string") {
                      if (mockRevisionsState.some((r) => r.id === obj)) {
                        matchedId = obj;
                      }
                    } else if (obj.value !== undefined && typeof obj.value === "string") {
                      if (mockRevisionsState.some((r) => r.id === obj.value)) {
                        matchedId = obj.value;
                      }
                    } else if (Array.isArray(obj)) {
                      obj.forEach(extractId);
                    } else if (obj.queryChunks) {
                      extractId(obj.queryChunks);
                    }
                  };
                  extractId(condition);

                  if (matchedId) {
                    const match = mockRevisionsState.find((r) => r.id === matchedId);
                    return match ? [{ ...match }] : [];
                  }
                  return mockRevisionsState.map((r) => ({ ...r }));
                }
                return [];
              };

              const promise = Promise.resolve(resolveQuery());
              (promise as any).for = vi.fn().mockImplementation((_lockMode: string) => {
                return Promise.resolve(resolveQuery());
              });
              return promise;
            }),
          })),
        })),

        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((values) => ({
            where: vi.fn().mockImplementation((_condition) => {
              if (table === chapterVariants || table?.[Symbol.for("drizzle:Name")] === "chapter_variants") {
                Object.assign(mockVariantState, values);
              }
              return Promise.resolve([mockVariantState]);
            }),
          })),
        })),

        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((values) => {
            const vals = Array.isArray(values) ? values : [values];
            const insertResult = {
              onConflictDoNothing: vi.fn().mockImplementation(() => {
                return Promise.resolve(vals);
              }),
              onConflictDoUpdate: vi.fn().mockImplementation(({ set }: any) => {
                if (table === publishedPreviews || table?.[Symbol.for("drizzle:Name")] === "published_previews") {
                  mockPreviewsState.push({ ...vals[0], ...set });
                }
                return Promise.resolve(vals);
              }),
              returning: vi.fn().mockResolvedValue(vals),
            };

            if (table === contentRevisions || table?.[Symbol.for("drizzle:Name")] === "content_revisions") {
              mockRevisionsState.push(...vals);
            } else if (table === auditEvents || table?.[Symbol.for("drizzle:Name")] === "audit_events") {
              mockAuditEventsState.push(...vals);
            } else if (table === publishedPreviews || table?.[Symbol.for("drizzle:Name")] === "published_previews") {
              mockPreviewsState.push(...vals);
            }

            return Object.assign(Promise.resolve(vals), insertResult);
          }),
        })),
      };

      client.transaction = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        return await cb(client);
      });

      return client;
    };

    mockDb = createMockClient();
  });

  describe("publishVariant", () => {
    it("swaps pointer and increments generation on success", async () => {
      const initialGen = mockVariantState.generation; // 3
      const result: PublishResult = await publishVariant(
        variantId,
        revisionId,
        initialGen,
        publisherActor,
        mockDb
      );

      expect(result.variantId).toBe(variantId);
      expect(result.revisionId).toBe(revisionId);
      expect(result.generation).toBe(initialGen + 1);
      expect(result.publishedAt).toBeInstanceOf(Date);

      expect(mockVariantState.publishedRevisionId).toBe(revisionId);
      expect(mockVariantState.generation).toBe(initialGen + 1);
    });

    it("returns 409 when expectedGeneration does not match", async () => {
      const wrongGen = 999;

      await expect(
        publishVariant(variantId, revisionId, wrongGen, publisherActor, mockDb)
      ).rejects.toThrow(ConflictError);

      try {
        await publishVariant(variantId, revisionId, wrongGen, publisherActor, mockDb);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictError);
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe("GENERATION_CONFLICT");
      }
    });

    it("enqueues outbox job for index/cache invalidation", async () => {
      const currentGen = mockVariantState.generation;
      const expectedNewGen = currentGen + 1;

      await publishVariant(variantId, revisionId, currentGen, publisherActor, mockDb);

      expect(enqueueOutboxJob).toHaveBeenCalledTimes(1);
      expect(enqueueOutboxJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: "publish_variant",
          aggregateId: variantId,
          dedupeKey: `publish-${variantId}-${revisionId}-${expectedNewGen}`,
          payload: {
            variantId,
            revisionId,
            generation: expectedNewGen,
          },
        })
      );
    });

    it("requires revision to belong to same variant", async () => {
      // foreignRevisionId belongs to otherVariantId
      await expect(
        publishVariant(
          variantId,
          foreignRevisionId,
          mockVariantState.generation,
          publisherActor,
          mockDb
        )
      ).rejects.toThrow(ValidationError);

      try {
        await publishVariant(
          variantId,
          foreignRevisionId,
          mockVariantState.generation,
          publisherActor,
          mockDb
        );
      } catch (err: any) {
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe("REVISION_MISMATCH");
      }
    });

    it("inserts audit event", async () => {
      const currentGen = mockVariantState.generation;
      const expectedNewGen = currentGen + 1;

      await publishVariant(variantId, revisionId, currentGen, publisherActor, mockDb);

      expect(mockAuditEventsState).toHaveLength(1);
      expect(mockAuditEventsState[0]).toEqual(
        expect.objectContaining({
          action: "publish_variant",
          aggregateType: "chapter_variant",
          aggregateId: variantId,
          actorId: publisherActor.userId,
          safeDiffJson: {
            previousRevisionId: safeRevisionId,
            newRevisionId: revisionId,
            generation: expectedNewGen,
          },
        })
      );
    });

    it("requires publisher or admin role (rejects editor)", async () => {
      await expect(
        publishVariant(
          variantId,
          revisionId,
          mockVariantState.generation,
          editorActor,
          mockDb
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it("allows admin role to publish", async () => {
      const result = await publishVariant(
        variantId,
        revisionId,
        mockVariantState.generation,
        adminActor,
        mockDb
      );
      expect(result.generation).toBe(4);
    });

    it("throws NotFoundError when variant does not exist", async () => {
      mockVariantState = null;

      await expect(
        publishVariant(variantId, revisionId, 1, publisherActor, mockDb)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("rollbackVariant", () => {
    it("swaps pointer to safe revision with reason", async () => {
      const initialGen = mockVariantState.generation;
      const reason = "Reverting accidental publishing of unapproved edits";

      const result: RollbackResult = await rollbackVariant(
        variantId,
        safeRevisionId,
        initialGen,
        reason,
        publisherActor,
        mockDb
      );

      expect(result.variantId).toBe(variantId);
      expect(result.revisionId).toBe(safeRevisionId);
      expect(result.generation).toBe(initialGen + 1);
      expect(result.reason).toBe(reason);
      expect(result.rolledBackAt).toBeInstanceOf(Date);

      expect(mockVariantState.publishedRevisionId).toBe(safeRevisionId);
      expect(mockVariantState.generation).toBe(initialGen + 1);
    });

    it("uses same CAS mechanism as publish", async () => {
      const staleGen = 1;

      await expect(
        rollbackVariant(
          variantId,
          safeRevisionId,
          staleGen,
          "Stale rollback attempt",
          publisherActor,
          mockDb
        )
      ).rejects.toThrow(ConflictError);

      try {
        await rollbackVariant(
          variantId,
          safeRevisionId,
          staleGen,
          "Stale rollback attempt",
          publisherActor,
          mockDb
        );
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictError);
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe("GENERATION_CONFLICT");
      }
    });

    it("requires non-empty reason for rollback", async () => {
      await expect(
        rollbackVariant(
          variantId,
          safeRevisionId,
          mockVariantState.generation,
          "",
          publisherActor,
          mockDb
        )
      ).rejects.toThrow(ValidationError);

      await expect(
        rollbackVariant(
          variantId,
          safeRevisionId,
          mockVariantState.generation,
          "   ",
          publisherActor,
          mockDb
        )
      ).rejects.toThrow(ValidationError);
    });

    it("requires revision to belong to same variant", async () => {
      await expect(
        rollbackVariant(
          variantId,
          foreignRevisionId,
          mockVariantState.generation,
          "Attempt foreign rollback",
          publisherActor,
          mockDb
        )
      ).rejects.toThrow(ValidationError);
    });

    it("inserts audit event with reason and safeDiff", async () => {
      const currentGen = mockVariantState.generation;
      const expectedNewGen = currentGen + 1;
      const reason = "Incident #42: Content rollback";

      await rollbackVariant(
        variantId,
        safeRevisionId,
        currentGen,
        reason,
        publisherActor,
        mockDb
      );

      expect(mockAuditEventsState).toHaveLength(1);
      expect(mockAuditEventsState[0]).toEqual(
        expect.objectContaining({
          action: "rollback_variant",
          aggregateType: "chapter_variant",
          aggregateId: variantId,
          actorId: publisherActor.userId,
          reason,
          safeDiffJson: expect.objectContaining({
            previousRevisionId: safeRevisionId,
            rolledBackToRevisionId: safeRevisionId,
            generation: expectedNewGen,
            reason,
          }),
        })
      );
    });

    it("enqueues outbox job for rollback", async () => {
      const currentGen = mockVariantState.generation;
      const expectedNewGen = currentGen + 1;
      const reason = "Rollback invalid copy";

      await rollbackVariant(
        variantId,
        safeRevisionId,
        currentGen,
        reason,
        publisherActor,
        mockDb
      );

      expect(enqueueOutboxJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: "rollback_variant",
          aggregateId: variantId,
          dedupeKey: `rollback-${variantId}-${safeRevisionId}-${expectedNewGen}`,
          payload: {
            variantId,
            revisionId: safeRevisionId,
            generation: expectedNewGen,
            reason,
          },
        })
      );
    });

    it("requires publisher or admin role", async () => {
      await expect(
        rollbackVariant(
          variantId,
          safeRevisionId,
          mockVariantState.generation,
          "Unauthorized rollback",
          editorActor,
          mockDb
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("compileDraft", () => {
    it("creates immutable content_revision from current draft", async () => {
      const initialRevisionsCount = mockRevisionsState.length;

      const result = await compileDraft(variantId, mockDb, publisherActor);

      expect(result).toHaveProperty("revisionId");
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("sourceHash");
      expect(result).toHaveProperty("manifestHash");
      expect(result).toHaveProperty("previewText");

      expect(mockRevisionsState.length).toBe(initialRevisionsCount + 1);
      const createdRevision = mockRevisionsState[mockRevisionsState.length - 1];
      expect(createdRevision.id).toBe(result.revisionId);
      expect(createdRevision.variantId).toBe(variantId);
      expect(createdRevision.sourceSha256).toBe(result.sourceHash);
      expect(createdRevision.manifestSha256).toBe(result.manifestHash);
      expect(createdRevision.createdBy).toBe(publisherActor.userId);
    });

    it("same source produces same hash", async () => {
      const result1 = await compileDraft(variantId, mockDb);
      const result2 = await compileDraft(variantId, mockDb);

      expect(result1.sourceHash).toBe(result2.sourceHash);
      expect(result1.manifestHash).toBe(result2.manifestHash);
    });

    it("records compiler_version and sanitizer_version", async () => {
      const result = await compileDraft(variantId, mockDb);
      const created = mockRevisionsState.find((r) => r.id === result.revisionId);

      expect(created).toBeDefined();
      expect(created.compilerVersion).toBe("1.0.0");
      expect(created.sanitizerVersion).toBe("1.0.0");
    });

    it("upserts published_previews with approved preview text and html", async () => {
      await compileDraft(variantId, mockDb, publisherActor);

      expect(mockPreviewsState.length).toBeGreaterThan(0);
      const preview = mockPreviewsState[mockPreviewsState.length - 1];
      expect(preview.variantId).toBe(variantId);
      expect(preview.previewText).toBeDefined();
      expect(preview.previewHtml).toBeDefined();
      expect(preview.approvedBy).toBe(publisherActor.userId);
    });

    it("throws NotFoundError when draft does not exist", async () => {
      mockDraftsState = [];

      await expect(
        compileDraft(variantId, mockDb)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
