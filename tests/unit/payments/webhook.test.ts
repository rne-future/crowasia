import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMayarWebhook } from "@/modules/payments/webhook";
import { POST } from "@/app/api/webhooks/mayar/route";
import { webhookInbox } from "@/shared/db/schema/jobs";

const { mockInsertedRows, state, mockTx } = vi.hoisted(() => {
  const rows: any[] = [];
  const flags = { shouldFailDb: false };
  const tx: any = {
    insert: vi.fn().mockImplementation((table) => ({
      values: vi.fn().mockImplementation((vals) => ({
        onConflictDoNothing: vi.fn().mockImplementation(() => {
          if (flags.shouldFailDb) {
            return Promise.reject(new Error("DB_CONNECTION_FAILURE"));
          }
          rows.push({ table, vals });
          return Promise.resolve();
        }),
      })),
    })),
  };
  return { mockInsertedRows: rows, state: flags, mockTx: tx };
});

vi.mock("@/shared/db/client", () => ({
  db: {
    ...mockTx,
    transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
  },
}));

describe("Mayar Webhook Ingestion (TDD)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertedRows.length = 0;
    state.shouldFailDb = false;
  });

  describe("handleMayarWebhook", () => {
    it("stores raw untrusted hint into webhook_inbox with sha256 payload hash", async () => {
      const payload = {
        event: "payment.received",
        data: {
          id: "inv_mock_12345",
          transactionId: "txn_mock_67890",
          amount: 150000,
          status: "paid",
        },
      };

      const result = await handleMayarWebhook(payload, undefined, mockTx);

      expect(result.received).toBe(true);
      expect(typeof result.inboxId).toBe("string");
      expect(mockInsertedRows.length).toBe(1);

      const inserted = mockInsertedRows[0];
      expect(inserted.table).toBe(webhookInbox);
      expect(inserted.vals.providerEnv).toMatch(/^mayar_/);
      expect(inserted.vals.eventKey).toContain("inv_mock_12345");
      expect(inserted.vals.payloadHash.length).toBe(64); // sha256
      expect(inserted.vals.normalizedJson).toEqual(payload);
      expect(inserted.vals.status).toBe("pending");
    });

    it("generates deterministic eventKey when explicit id is absent", async () => {
      const payload = {
        arbitraryField: "test_value_123",
      };

      const result = await handleMayarWebhook(payload, undefined, mockTx);

      expect(result.received).toBe(true);
      expect(mockInsertedRows.length).toBe(1);
      const inserted = mockInsertedRows[0];
      expect(inserted.vals.eventKey).toBeDefined();
      expect(inserted.vals.eventKey.length).toBeGreaterThan(0);
    });

    it("handles duplicate delivery safely without throwing", async () => {
      const payload = {
        id: "evt_unique_1",
        data: { id: "inv_123" },
      };

      const res1 = await handleMayarWebhook(payload, undefined, mockTx);
      const res2 = await handleMayarWebhook(payload, undefined, mockTx);

      expect(res1.received).toBe(true);
      expect(res2.received).toBe(true);
    });

    it("rejects non-object or null payloads", async () => {
      await expect(handleMayarWebhook(null, undefined, mockTx)).rejects.toThrow();
      await expect(handleMayarWebhook("not an object", undefined, mockTx)).rejects.toThrow();
    });
  });

  describe("POST /api/webhooks/mayar", () => {
    it("returns 200 { received: true } upon successful durable commit", async () => {
      const payload = {
        id: "evt_test_post",
        data: { id: "inv_test_post" },
      };

      const req = new Request("https://crow.asia/api/webhooks/mayar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ received: true });
      expect(mockInsertedRows.length).toBe(1);
    });

    it("returns 413 Payload Too Large when body exceeds 64KB", async () => {
      // 65KB string
      const largeData = "x".repeat(65536 + 10);
      const req = new Request("https://crow.asia/api/webhooks/mayar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(largeData.length),
        },
        body: largeData,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    it("returns 400 Bad Request when JSON is malformed", async () => {
      const req = new Request("https://crow.asia/api/webhooks/mayar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{ malformed json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 500 when database fails to ensure processor retries", async () => {
      state.shouldFailDb = true;

      const req = new Request("https://crow.asia/api/webhooks/mayar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: "evt_fail_db" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
