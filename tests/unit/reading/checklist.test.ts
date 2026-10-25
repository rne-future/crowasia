import { describe, it, expect, vi, beforeEach } from "vitest";
import * as checklistModule from "@/modules/reading/checklist";
import {
  getChecklistProgress,
  updateChecklistProgress,
} from "@/modules/reading/checklist";
import {
  NotFoundError,
  GoneError,
  ProgressConflictError,
} from "@/modules/reading/types";
import { PUT as putChecklistRoute } from "@/app/api/checklists/[itemId]/route";
import * as identityModule from "@/modules/identity/get-actor";
import type { Actor } from "@/modules/identity/types";
import { checklistItems, checklistProgress } from "@/shared/db/schema/reading";

describe("Checklist Progress Service & Route (TDD)", () => {
  const userId = "user-1111-1111-1111-111111111111";
  const itemId = "item-2222-2222-2222-222222222222";
  const retiredItemId = "item-3333-3333-3333-333333333333";
  const nonExistentItemId = "item-4444-4444-4444-444444444444";

  const mockActor: Actor = {
    userId,
    verifiedEmail: "reader@example.com",
    roles: ["reader"],
    authTime: new Date("2026-10-25T10:00:00.000Z"),
  };

  let mockChecklistItems: Array<{
    id: string;
    chapterId: string;
    retiredAt: Date | null;
    createdAt: Date;
  }>;

  let mockProgressState: Array<{
    userId: string;
    itemId: string;
    completed: boolean;
    version: number;
    updatedAt: Date;
  }>;

  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChecklistItems = [
      {
        id: itemId,
        chapterId: "chapter-1",
        retiredAt: null,
        createdAt: new Date("2026-10-01"),
      },
      {
        id: retiredItemId,
        chapterId: "chapter-1",
        retiredAt: new Date("2026-10-15"),
        createdAt: new Date("2026-10-01"),
      },
    ];

    mockProgressState = [];

    // Construct mock query builder supporting select, insert, update
    mockDb = {
      select: vi.fn().mockImplementation((fields?: any) => {
        let fromTable: any = null;
        let whereCondition: any = null;

        const builder: any = {
          from: vi.fn().mockImplementation((table: any) => {
            fromTable = table;
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCondition = cond;
            return builder;
          }),
          limit: vi.fn().mockImplementation((_n: number) => {
            return Promise.resolve(builder.execute().slice(0, _n));
          }),
          execute: () => {
            if (fromTable === checklistItems) {
              const vals = extractValues(whereCondition);
              return mockChecklistItems.filter((i) => vals.includes(i.id));
            }
            if (fromTable === checklistProgress) {
              const vals = extractValues(whereCondition);
              return mockProgressState.filter((p) => {
                if (vals.includes(userId) && p.userId !== userId) return false;
                const hasItemId = vals.some((v) =>
                  [itemId, retiredItemId, nonExistentItemId].includes(v)
                );
                if (hasItemId && !vals.includes(p.itemId)) return false;
                return true;
              });
            }
            return [];
          },
        };
        builder.then = (resolve: any) => resolve(builder.execute());
        return builder;
      }),

      insert: vi.fn().mockImplementation((table: any) => {
        let insertedValues: any = null;
        const builder: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            insertedValues = vals;
            return builder;
          }),
          returning: vi.fn().mockImplementation(() => {
            if (table === checklistProgress) {
              const row = {
                ...insertedValues,
                updatedAt: insertedValues.updatedAt || new Date(),
              };
              mockProgressState.push(row);
              return Promise.resolve([row]);
            }
            return Promise.resolve([insertedValues]);
          }),
          execute: () => {
            if (table === checklistProgress) {
              mockProgressState.push(insertedValues);
            }
            return Promise.resolve();
          },
        };
        builder.then = (resolve: any) => resolve(builder.returning());
        return builder;
      }),

      update: vi.fn().mockImplementation((table: any) => {
        let updateValues: any = null;
        let whereCondition: any = null;

        const builder: any = {
          set: vi.fn().mockImplementation((vals: any) => {
            updateValues = vals;
            return builder;
          }),
          where: vi.fn().mockImplementation((cond: any) => {
            whereCondition = cond;
            return builder;
          }),
          returning: vi.fn().mockImplementation(() => {
            if (table === checklistProgress) {
              const vals = extractValues(whereCondition);
              const targetItemId = vals.find((v) =>
                [itemId, retiredItemId, nonExistentItemId].includes(v)
              );
              const targetUserId = vals.includes(userId) ? userId : undefined;
              const expectedVer = vals.find((v) => typeof v === "number");

              const row = mockProgressState.find(
                (p) =>
                  p.userId === targetUserId &&
                  p.itemId === targetItemId &&
                  (expectedVer === undefined || p.version === expectedVer)
              );

              if (!row) {
                return Promise.resolve([]);
              }

              row.completed = updateValues.completed;
              row.version = row.version + 1;
              row.updatedAt = new Date();
              return Promise.resolve([row]);
            }
            return Promise.resolve([]);
          }),
        };
        builder.then = (resolve: any) => resolve(builder.returning());
        return builder;
      }),
    };
  });

  function extractValues(cond: any, visited = new Set<any>()): any[] {
    if (!cond || typeof cond !== "object" || visited.has(cond)) return [];
    visited.add(cond);

    const values: any[] = [];
    if ("value" in cond && cond.value !== undefined && !cond.table) {
      if (Array.isArray(cond.value)) {
        values.push(...cond.value);
      } else {
        values.push(cond.value);
      }
    }
    if (Array.isArray(cond.values)) {
      for (const v of cond.values) {
        values.push(v);
      }
    }
    if (Array.isArray(cond.queryChunks)) {
      for (const chunk of cond.queryChunks) {
        if (chunk && typeof chunk === "object" && !chunk.table) {
          values.push(...extractValues(chunk, visited));
        }
      }
    }
    return values;
  }

  describe("getChecklistProgress", () => {
    it("returns empty map when itemIds list is empty", async () => {
      const res = await getChecklistProgress(userId, [], mockDb);
      expect(res.size).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("returns user progress map for requested itemIds", async () => {
      mockProgressState.push({
        userId,
        itemId,
        completed: true,
        version: 3,
        updatedAt: new Date(),
      });

      const res = await getChecklistProgress(userId, [itemId], mockDb);
      expect(res.size).toBe(1);
      expect(res.get(itemId)).toEqual({ completed: true, version: 3 });
    });
  });

  describe("updateChecklistProgress", () => {
    it("throws NotFoundError (404) when item does not exist in checklist_items", async () => {
      await expect(
        updateChecklistProgress(userId, nonExistentItemId, true, 0, mockDb)
      ).rejects.toThrow(NotFoundError);
    });

    it("throws GoneError (410) when item is retired (retiredAt IS NOT NULL)", async () => {
      await expect(
        updateChecklistProgress(userId, retiredItemId, true, 0, mockDb)
      ).rejects.toThrow(GoneError);
    });

    it("inserts new row with version 1 on initial check when expectedVersion === 0", async () => {
      const result = await updateChecklistProgress(userId, itemId, true, 0, mockDb);

      expect(result).toMatchObject({
        itemId,
        completed: true,
        version: 1,
      });
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockProgressState).toHaveLength(1);
      expect(mockProgressState[0].version).toBe(1);
      expect(mockProgressState[0].completed).toBe(true);
    });

    it("throws ProgressConflictError (409) on initial check when expectedVersion !== 0", async () => {
      await expect(
        updateChecklistProgress(userId, itemId, true, 2, mockDb)
      ).rejects.toThrow(ProgressConflictError);

      try {
        await updateChecklistProgress(userId, itemId, true, 2, mockDb);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProgressConflictError);
        expect(err.status).toBe(409);
        expect(err.code).toBe("PROGRESS_CONFLICT");
        expect(err.current).toEqual({ completed: false, version: 0 });
      }
    });

    it("increments version and updates status on matching expectedVersion", async () => {
      // Seed initial state
      mockProgressState.push({
        userId,
        itemId,
        completed: true,
        version: 1,
        updatedAt: new Date("2026-10-25T10:00:00Z"),
      });

      const result = await updateChecklistProgress(userId, itemId, false, 1, mockDb);

      expect(result).toMatchObject({
        itemId,
        completed: false,
        version: 2,
      });
      expect(mockProgressState[0].version).toBe(2);
      expect(mockProgressState[0].completed).toBe(false);
    });

    it("throws ProgressConflictError (409) with current state on mismatched expectedVersion", async () => {
      mockProgressState.push({
        userId,
        itemId,
        completed: true,
        version: 5,
        updatedAt: new Date("2026-10-25T10:00:00Z"),
      });

      try {
        await updateChecklistProgress(userId, itemId, false, 4, mockDb);
        expect.unreachable("Should have thrown ProgressConflictError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProgressConflictError);
        expect(err.status).toBe(409);
        expect(err.code).toBe("PROGRESS_CONFLICT");
        expect(err.current).toEqual({ completed: true, version: 5 });
      }
    });
  });

  describe("PUT /api/checklists/[itemId] Route", () => {
    it("returns 401 when actor is not authenticated", async () => {
      vi.spyOn(identityModule, "requireActor").mockRejectedValue(
        new Error("Unauthorized: actor authentication required")
      );

      const req = new Request(`http://localhost/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, expectedVersion: 0 }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId }),
      });

      expect(res.status).toBe(401);
    });

    it("returns 400 when body is invalid or missing fields", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);

      const req = new Request(`http://localhost/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "data" }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("returns 200 with updated progress for authenticated actor", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      vi.spyOn(checklistModule, "updateChecklistProgress").mockResolvedValue({
        itemId,
        completed: true,
        version: 1,
        updatedAt: new Date("2026-10-25T10:00:00Z"),
      });

      const req = new Request(`http://localhost/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, expectedVersion: 0 }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        itemId,
        completed: true,
        version: 1,
      });
    });

    it("returns 409 with conflict details when ProgressConflictError is thrown", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      vi.spyOn(checklistModule, "updateChecklistProgress").mockRejectedValue(
        new ProgressConflictError("PROGRESS_CONFLICT", 409, {
          completed: true,
          version: 3,
        })
      );

      const req = new Request(`http://localhost/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: false, expectedVersion: 1 }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toEqual({
        code: "PROGRESS_CONFLICT",
        message: "Progres berubah di perangkat lain",
      });
      expect(json.current).toEqual({
        completed: true,
        version: 3,
      });
    });

    it("returns 410 when GoneError is thrown", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      vi.spyOn(checklistModule, "updateChecklistProgress").mockRejectedValue(
        new GoneError("Item is retired", "ITEM_RETIRED")
      );

      const req = new Request(`http://localhost/api/checklists/${retiredItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, expectedVersion: 0 }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId: retiredItemId }),
      });

      expect(res.status).toBe(410);
      const json = await res.json();
      expect(json.error).toEqual({
        code: "ITEM_RETIRED",
        message: "Item ini sudah tidak berlaku",
      });
    });

    it("returns 404 when NotFoundError is thrown", async () => {
      vi.spyOn(identityModule, "requireActor").mockResolvedValue(mockActor);
      vi.spyOn(checklistModule, "updateChecklistProgress").mockRejectedValue(
        new NotFoundError("Item not found", 404)
      );

      const req = new Request(`http://localhost/api/checklists/${nonExistentItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, expectedVersion: 0 }),
      });

      const res = await putChecklistRoute(req, {
        params: Promise.resolve({ itemId: nonExistentItemId }),
      });

      expect(res.status).toBe(404);
    });
  });
});
