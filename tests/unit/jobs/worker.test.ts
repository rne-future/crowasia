import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateBackoff } from "@/shared/jobs/types";
import { processInbox, runInboxWorker } from "@/shared/jobs/process-inbox";
import { processOutbox, runOutboxWorker } from "@/shared/jobs/process-outbox";
import { enqueueOutboxJob } from "@/shared/jobs/outbox-worker";
import { insertInboxEvent } from "@/shared/jobs/inbox-worker";
import { webhookInbox, outboxJobs } from "@/shared/db/schema/jobs";
import { GET, POST } from "@/app/api/cron/jobs/route";

vi.mock("@/shared/db/client", () => {
  const dummyTx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    }),
  };

  return {
    db: {
      ...dummyTx,
      transaction: vi.fn().mockImplementation(async (cb) => cb(dummyTx)),
    },
  };
});

describe("Worker Subsystem (TDD)", () => {
  describe("calculateBackoff", () => {
    it("applies exponential formula min(baseMs * 2^attempt + jitter, 15 * 60 * 1000)", () => {
      // With jitter disabled:
      // attempt 0: 1000 * 2^0 = 1000
      expect(calculateBackoff(0, { baseMs: 1000, jitter: false })).toBe(1000);
      // attempt 1: 1000 * 2^1 = 2000
      expect(calculateBackoff(1, { baseMs: 1000, jitter: false })).toBe(2000);
      // attempt 2: 1000 * 2^2 = 4000
      expect(calculateBackoff(2, { baseMs: 1000, jitter: false })).toBe(4000);
      // attempt 3: 1000 * 2^3 = 8000
      expect(calculateBackoff(3, { baseMs: 1000, jitter: false })).toBe(8000);
    });

    it("applies exponential backoff with jitter", () => {
      const fixedJitter = 250;
      const backoff = calculateBackoff(1, { baseMs: 1000, jitter: fixedJitter });
      expect(backoff).toBe(2000 + 250);
    });

    it("caps retry backoff at 15 minutes", () => {
      const fifteenMinutesMs = 15 * 60 * 1000; // 900,000 ms
      const backoffHighAttempt = calculateBackoff(20, { baseMs: 1000, jitter: false });
      expect(backoffHighAttempt).toBe(fifteenMinutesMs);

      const backoffWithJitter = calculateBackoff(20, { baseMs: 1000, jitter: 50000 });
      expect(backoffWithJitter).toBe(fifteenMinutesMs);
    });
  });

  describe("processInbox", () => {
    let mockEvents: any[] = [];
    let querySpies: {
      forUpdateCalled: boolean;
      skipLockedCalled: boolean;
    };
    let mockTx: any;
    let mockDb: any;

    beforeEach(() => {
      querySpies = {
        forUpdateCalled: false,
        skipLockedCalled: false,
      };

      mockEvents = [
        {
          id: "inbox-1",
          providerEnv: "midtrans_production",
          eventKey: "evt_order_123",
          payloadHash: "hash123",
          normalizedJson: { eventType: "payment_success", orderId: "ord-1" },
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(Date.now() - 5000),
          leaseUntil: null,
          errorCode: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((_table) => ({
            where: vi.fn().mockImplementation((_condition) => ({
              orderBy: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => ({
                  for: vi.fn().mockImplementation((lockMode, options) => {
                    if (lockMode === "update") querySpies.forUpdateCalled = true;
                    if (options?.skipLocked) querySpies.skipLockedCalled = true;
                    return Promise.resolve(mockEvents.filter((e) => e.status === "pending" || e.status === "retry"));
                  }),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((_table) => ({
          set: vi.fn().mockImplementation((setValues) => ({
            where: vi.fn().mockImplementation((_whereCondition) => {
              for (const event of mockEvents) {
                Object.assign(event, setValues);
              }
              return Promise.resolve();
            }),
          })),
        })),
      };

      mockDb = {
        ...mockTx,
        transaction: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTx);
        }),
      };
    });

    it("claims pending items with FOR UPDATE SKIP LOCKED", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: handler },
      });

      expect(querySpies.forUpdateCalled).toBe(true);
      expect(querySpies.skipLockedCalled).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "inbox-1" }));
      expect(result.processed).toBe(1);
      expect(mockEvents[0].status).toBe("processed");
    });

    it("increments attempts and sets backoff on failure", async () => {
      const failureHandler = vi.fn().mockRejectedValue(new Error("Transient connection error"));

      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: failureHandler },
        baseMs: 1000,
        jitter: false,
      });

      expect(result.retried).toBe(1);
      expect(mockEvents[0].attempts).toBe(1);
      expect(mockEvents[0].status).toBe("retry");
      expect(mockEvents[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockEvents[0].errorCode).toBe("Transient connection error");
    });

    it("moves to dead-letter after 8 attempts", async () => {
      mockEvents[0].attempts = 7; // 7 attempts previously, this failure is the 8th
      const deadHandler = vi.fn().mockRejectedValue(new Error("Permanent unrecoverable error"));

      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: deadHandler },
        maxAttempts: 8,
      });

      expect(result.dead).toBe(1);
      expect(mockEvents[0].attempts).toBe(8);
      expect(mockEvents[0].status).toBe("dead");
      expect(mockEvents[0].leaseUntil).toBeNull();
    });

    it("duplicate processed event returns without side effect", async () => {
      mockEvents[0].status = "processed";
      const handler = vi.fn().mockResolvedValue(undefined);

      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: handler },
      });

      expect(handler).not.toHaveBeenCalled();
      expect(result.processed).toBe(0);
      expect(result.claimed).toBe(0);
    });
  });

  describe("processOutbox", () => {
    let mockJobs: any[] = [];
    let mockTx: any;
    let mockDb: any;
    let querySpies: {
      forUpdateCalled: boolean;
      skipLockedCalled: boolean;
    };

    beforeEach(() => {
      querySpies = {
        forUpdateCalled: false,
        skipLockedCalled: false,
      };

      mockJobs = [
        {
          id: "job-1",
          kind: "content.published",
          aggregateId: "variant-100",
          dedupeKey: "content_published_variant_100_gen_1",
          payloadJson: { revisionId: "rev-1", generation: 1 },
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(Date.now() - 5000),
          leaseUntil: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((_table) => ({
            where: vi.fn().mockImplementation((_condition) => ({
              orderBy: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => ({
                  for: vi.fn().mockImplementation((lockMode, options) => {
                    if (lockMode === "update") querySpies.forUpdateCalled = true;
                    if (options?.skipLocked) querySpies.skipLockedCalled = true;
                    return Promise.resolve(mockJobs.filter((j) => j.status === "pending" || j.status === "retry"));
                  }),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((_table) => ({
          set: vi.fn().mockImplementation((setValues) => ({
            where: vi.fn().mockImplementation((_whereCondition) => {
              for (const job of mockJobs) {
                Object.assign(job, setValues);
              }
              return Promise.resolve();
            }),
          })),
        })),
      };

      mockDb = {
        ...mockTx,
        transaction: vi.fn().mockImplementation(async (callback) => {
          return await callback(mockTx);
        }),
      };
    });

    it("processes pending jobs by dedupe_key uniqueness", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const result = await processOutbox(mockDb, {
        handlers: { "content.published": handler },
      });

      expect(querySpies.forUpdateCalled).toBe(true);
      expect(querySpies.skipLockedCalled).toBe(true);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dedupeKey: "content_published_variant_100_gen_1" })
      );
      expect(result.processed).toBe(1);
      expect(mockJobs[0].status).toBe("processed");
      expect(mockJobs[0].completedAt).toBeInstanceOf(Date);
    });

    it("applies exponential backoff with jitter", async () => {
      const failureHandler = vi.fn().mockRejectedValue(new Error("External webhook timeout"));

      const result = await processOutbox(mockDb, {
        handlers: { "content.published": failureHandler },
        baseMs: 2000,
        jitter: 100,
      });

      expect(result.retried).toBe(1);
      expect(mockJobs[0].attempts).toBe(1);
      expect(mockJobs[0].status).toBe("retry");
      // attempt 1: baseMs * 2^1 + 100 = 4100ms
      expect(mockJobs[0].nextAttemptAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 4000);
    });

    it("caps retry backoff at 15 minutes", async () => {
      mockJobs[0].attempts = 6;
      const failureHandler = vi.fn().mockRejectedValue(new Error("Persistent failure"));

      const result = await processOutbox(mockDb, {
        handlers: { "content.published": failureHandler },
        baseMs: 60000, // 60s * 2^7 is way above 15 mins
        jitter: false,
      });

      expect(result.retried).toBe(1);
      expect(mockJobs[0].attempts).toBe(7);
      const diffMs = mockJobs[0].nextAttemptAt.getTime() - Date.now();
      // Backoff capped at 15 minutes (900,000 ms)
      expect(diffMs).toBeLessThanOrEqual(15 * 60 * 1000 + 500);
      expect(diffMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 500);
    });

    it("moves to dead-letter after 8 attempts", async () => {
      mockJobs[0].attempts = 7;
      const failureHandler = vi.fn().mockRejectedValue(new Error("Final attempt failed"));

      const result = await processOutbox(mockDb, {
        handlers: { "content.published": failureHandler },
        maxAttempts: 8,
      });

      expect(result.dead).toBe(1);
      expect(mockJobs[0].attempts).toBe(8);
      expect(mockJobs[0].status).toBe("dead");
      expect(mockJobs[0].leaseUntil).toBeNull();
    });
  });

  describe("enqueueOutboxJob", () => {
    it("inserts job within caller transaction", async () => {
      const inserted: any[] = [];
      const mockTx: any = {
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((vals) => ({
            onConflictDoNothing: vi.fn().mockImplementation(() => {
              inserted.push({ table, vals });
              return Promise.resolve();
            }),
          })),
        })),
      };

      await enqueueOutboxJob(mockTx, {
        kind: "catalog.sync",
        aggregateId: "book-1",
        dedupeKey: "catalog_sync_book_1",
        payload: { title: "Crow Asia Book" },
      });

      expect(mockTx.insert).toHaveBeenCalledWith(outboxJobs);
      expect(inserted.length).toBe(1);
      expect(inserted[0].vals.dedupeKey).toBe("catalog_sync_book_1");
      expect(inserted[0].vals.kind).toBe("catalog.sync");
      expect(inserted[0].vals.payloadJson).toEqual({ title: "Crow Asia Book" });
    });

    it("duplicate dedupe_key is ignored", async () => {
      const onConflictDoNothingSpy = vi.fn().mockResolvedValue(undefined);
      const mockTx: any = {
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation(() => ({
            onConflictDoNothing: onConflictDoNothingSpy,
          })),
        })),
      };

      await enqueueOutboxJob(mockTx, {
        kind: "catalog.sync",
        aggregateId: "book-1",
        dedupeKey: "duplicate_key",
        payload: { attempt: 1 },
      });

      expect(onConflictDoNothingSpy).toHaveBeenCalled();
    });
  });

  describe("insertInboxEvent", () => {
    it("inserts event within caller transaction", async () => {
      const inserted: any[] = [];
      const mockTx: any = {
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((vals) => ({
            onConflictDoNothing: vi.fn().mockImplementation(() => {
              inserted.push({ table, vals });
              return Promise.resolve();
            }),
          })),
        })),
      };

      await insertInboxEvent(mockTx, {
        providerEnv: "midtrans_production",
        eventKey: "evt_123",
        payloadHash: "hash_abc",
        normalizedJson: { foo: "bar" },
      });

      expect(mockTx.insert).toHaveBeenCalledWith(webhookInbox);
      expect(inserted.length).toBe(1);
      expect(inserted[0].vals.eventKey).toBe("evt_123");
      expect(inserted[0].vals.providerEnv).toBe("midtrans_production");
    });

    it("duplicate providerEnv + eventKey is ignored", async () => {
      const onConflictDoNothingSpy = vi.fn().mockResolvedValue(undefined);
      const mockTx: any = {
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation(() => ({
            onConflictDoNothing: onConflictDoNothingSpy,
          })),
        })),
      };

      await insertInboxEvent(mockTx, {
        providerEnv: "midtrans_production",
        eventKey: "evt_123",
        payloadHash: "hash_abc",
        normalizedJson: { foo: "bar" },
      });

      expect(onConflictDoNothingSpy).toHaveBeenCalled();
    });
  });

  describe("Cron Jobs API Route", () => {
    const originalEnv = process.env.CRON_SECRET;

    beforeEach(() => {
      process.env.CRON_SECRET = "test-cron-secret-123";
    });

    afterEach(() => {
      process.env.CRON_SECRET = originalEnv;
    });

    it("rejects unauthorized requests with 401", async () => {
      const request = new Request("http://localhost:3000/api/cron/jobs", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-secret",
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("accepts valid CRON_SECRET for POST and returns structured JSON", async () => {
      const request = new Request("http://localhost:3000/api/cron/jobs", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret-123",
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.inbox).toBeDefined();
      expect(json.outbox).toBeDefined();
    });

    it("accepts valid CRON_SECRET for GET (standard Vercel Cron)", async () => {
      const request = new Request("http://localhost:3000/api/cron/jobs", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-cron-secret-123",
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.inbox).toBeDefined();
      expect(json.outbox).toBeDefined();
    });
  });
});
