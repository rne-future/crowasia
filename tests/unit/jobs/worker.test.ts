import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateBackoff, type DbTransaction, type DbOrTx } from "@/shared/jobs/types";
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
                    return Promise.resolve(
                      mockEvents.filter((e) => {
                        const isPendingOrRetry =
                          (e.status === "pending" || e.status === "retry") &&
                          (!e.leaseUntil || e.leaseUntil < new Date()) &&
                          (!e.nextAttemptAt || e.nextAttemptAt <= new Date());
                        const isExpiredProcessing =
                          e.status === "processing" && e.leaseUntil && e.leaseUntil < new Date();
                        return (isPendingOrRetry || isExpiredProcessing) && (e.attempts ?? 0) < 8;
                      })
                    );
                  }),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((_table) => ({
          set: vi.fn().mockImplementation((setValues) => ({
            where: vi.fn().mockImplementation((whereCondition) => {
              const ids: string[] = [];
              const walk = (item: any) => {
                if (!item) return;
                if (Array.isArray(item)) {
                  item.forEach(walk);
                } else if (item.value !== undefined && typeof item.value === "string") {
                  ids.push(item.value);
                } else if (item.queryChunks) {
                  walk(item.queryChunks);
                }
              };
              walk(whereCondition);

              for (const event of mockEvents) {
                if (ids.length === 0 || ids.includes(event.id)) {
                  Object.assign(event, setValues);
                }
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

    it("reclaims expired processing leases after worker crash", async () => {
      mockEvents = [
        {
          id: "inbox-crashed",
          providerEnv: "midtrans_production",
          eventKey: "evt_crashed_123",
          payloadHash: "hash_crashed",
          normalizedJson: { eventType: "payment_success" },
          status: "processing",
          attempts: 1,
          nextAttemptAt: new Date(Date.now() - 60000),
          leaseUntil: new Date(Date.now() - 10000), // Expired 10s ago
          errorCode: null,
          createdAt: new Date(Date.now() - 120000),
          updatedAt: new Date(Date.now() - 60000),
        },
      ];

      const handler = vi.fn().mockResolvedValue(undefined);
      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: handler },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inbox-crashed" })
      );
      expect(result.claimed).toBe(1);
      expect(result.processed).toBe(1);
      expect(mockEvents[0].status).toBe("processed");
      expect(mockEvents[0].leaseUntil).toBeNull();
    });

    it("calculates oldestPendingAgeMs from oldest createdAt in claimed batch", async () => {
      const now = Date.now();
      mockEvents = [
        {
          id: "inbox-newer",
          providerEnv: "midtrans_production",
          eventKey: "evt_newer",
          payloadHash: "hash_newer",
          normalizedJson: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(now - 10000), // earlier nextAttemptAt -> claimedRows[0]
          leaseUntil: null,
          errorCode: null,
          createdAt: new Date(now - 2000), // 2 seconds old
          updatedAt: new Date(),
        },
        {
          id: "inbox-older",
          providerEnv: "midtrans_production",
          eventKey: "evt_older",
          payloadHash: "hash_older",
          normalizedJson: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(now - 5000), // later nextAttemptAt -> claimedRows[1]
          leaseUntil: null,
          errorCode: null,
          createdAt: new Date(now - 60000), // 60 seconds old
          updatedAt: new Date(),
        },
      ];

      const handler = vi.fn().mockResolvedValue(undefined);
      const result = await processInbox(mockDb, {
        handlers: { midtrans_production: handler },
      });

      expect(result.claimed).toBe(2);
      expect(result.processed).toBe(2);
      // oldestPendingAgeMs must reflect the 60s old item, NOT the 2s old first item
      expect(result.oldestPendingAgeMs).toBeGreaterThanOrEqual(59000);
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
                    return Promise.resolve(
                      mockJobs.filter((j) => {
                        const isPendingOrRetry =
                          (j.status === "pending" || j.status === "retry") &&
                          (!j.leaseUntil || j.leaseUntil < new Date()) &&
                          (!j.nextAttemptAt || j.nextAttemptAt <= new Date());
                        const isExpiredProcessing =
                          j.status === "processing" && j.leaseUntil && j.leaseUntil < new Date();
                        return (isPendingOrRetry || isExpiredProcessing) && (j.attempts ?? 0) < 8;
                      })
                    );
                  }),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((_table) => ({
          set: vi.fn().mockImplementation((setValues) => ({
            where: vi.fn().mockImplementation((whereCondition) => {
              const ids: string[] = [];
              const walk = (item: any) => {
                if (!item) return;
                if (Array.isArray(item)) {
                  item.forEach(walk);
                } else if (item.value !== undefined && typeof item.value === "string") {
                  ids.push(item.value);
                } else if (item.queryChunks) {
                  walk(item.queryChunks);
                }
              };
              walk(whereCondition);

              for (const job of mockJobs) {
                if (ids.length === 0 || ids.includes(job.id)) {
                  Object.assign(job, setValues);
                }
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

    it("reclaims expired processing leases after worker crash", async () => {
      mockJobs = [
        {
          id: "job-crashed",
          kind: "content.published",
          aggregateId: "variant-crashed",
          dedupeKey: "content_published_variant_crashed",
          payloadJson: { revisionId: "rev-crashed" },
          status: "processing",
          attempts: 1,
          nextAttemptAt: new Date(Date.now() - 60000),
          leaseUntil: new Date(Date.now() - 10000), // Expired 10s ago
          completedAt: null,
          createdAt: new Date(Date.now() - 120000),
          updatedAt: new Date(Date.now() - 60000),
        },
      ];

      const handler = vi.fn().mockResolvedValue(undefined);
      const result = await processOutbox(mockDb, {
        handlers: { "content.published": handler },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dedupeKey: "content_published_variant_crashed" })
      );
      expect(result.claimed).toBe(1);
      expect(result.processed).toBe(1);
      expect(mockJobs[0].status).toBe("processed");
      expect(mockJobs[0].completedAt).toBeInstanceOf(Date);
      expect(mockJobs[0].leaseUntil).toBeNull();
    });

    it("calculates oldestPendingAgeMs from oldest createdAt in claimed batch", async () => {
      const now = Date.now();
      mockJobs = [
        {
          id: "job-newer",
          kind: "content.published",
          aggregateId: "v1",
          dedupeKey: "k1",
          payloadJson: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(now - 10000), // earlier nextAttemptAt -> claimedRows[0]
          leaseUntil: null,
          completedAt: null,
          createdAt: new Date(now - 3000), // 3 seconds old
          updatedAt: new Date(),
        },
        {
          id: "job-older",
          kind: "content.published",
          aggregateId: "v2",
          dedupeKey: "k2",
          payloadJson: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(now - 5000), // later nextAttemptAt -> claimedRows[1]
          leaseUntil: null,
          completedAt: null,
          createdAt: new Date(now - 80000), // 80 seconds old
          updatedAt: new Date(),
        },
      ];

      const handler = vi.fn().mockResolvedValue(undefined);
      const result = await processOutbox(mockDb, {
        handlers: { "content.published": handler },
      });

      expect(result.claimed).toBe(2);
      expect(result.processed).toBe(2);
      // oldestPendingAgeMs must reflect the 80s old item, NOT the 3s old first item
      expect(result.oldestPendingAgeMs).toBeGreaterThanOrEqual(79000);
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

    it("accepts PgTransaction from db.transaction and runs within transaction", async () => {
      const inserted: any[] = [];
      const dummyPgTransaction = {
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((vals) => ({
            onConflictDoNothing: vi.fn().mockImplementation(() => {
              inserted.push({ table, vals });
              return Promise.resolve();
            }),
          })),
        })),
      };

      // Type-level assertion & runtime invocation: ensures DbTransaction can be passed directly
      const typeSafeInvocation = async (tx: DbTransaction) => {
        await enqueueOutboxJob(tx, {
          kind: "catalog.sync",
          aggregateId: "book-tx",
          dedupeKey: "catalog_sync_tx",
          payload: { inTransaction: true },
        });
      };

      await typeSafeInvocation(dummyPgTransaction as unknown as DbTransaction);

      expect(dummyPgTransaction.insert).toHaveBeenCalledWith(outboxJobs);
      expect(inserted.length).toBe(1);
      expect(inserted[0].vals.dedupeKey).toBe("catalog_sync_tx");
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

    it("accepts PgTransaction from db.transaction and runs within transaction", async () => {
      const inserted: any[] = [];
      const dummyPgTransaction = {
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((vals) => ({
            onConflictDoNothing: vi.fn().mockImplementation(() => {
              inserted.push({ table, vals });
              return Promise.resolve();
            }),
          })),
        })),
      };

      const typeSafeInvocation = async (tx: DbTransaction) => {
        await insertInboxEvent(tx, {
          providerEnv: "midtrans_production",
          eventKey: "evt_tx_1",
          payloadHash: "hash_tx_1",
          normalizedJson: { inTransaction: true },
        });
      };

      await typeSafeInvocation(dummyPgTransaction as unknown as DbTransaction);

      expect(dummyPgTransaction.insert).toHaveBeenCalledWith(webhookInbox);
      expect(inserted.length).toBe(1);
      expect(inserted[0].vals.eventKey).toBe("evt_tx_1");
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
