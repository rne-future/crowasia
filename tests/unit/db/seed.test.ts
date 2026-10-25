import { describe, it, expect, vi } from "vitest";
import { seed } from "@/../scripts/seed";

describe("Database Seed Script", () => {
  it("defines the expected seed data sets when executed with mock db", async () => {
    const insertedRecords: Record<string, any[]> = {};

    const mockDb: any = {
      insert: (table: any) => ({
        values: (values: any) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              const tableName = table[Symbol.for("drizzle:Name")] || "unknown";
              const items = Array.isArray(values) ? values : [values];
              const withIds = items.map((item, idx) => ({
                id: item.id || `mock-id-${tableName}-${idx}`,
                ...item,
              }));
              insertedRecords[tableName] = withIds;
              return withIds;
            },
          }),
        }),
      }),
      select: () => ({
        from: (table: any) => {
          const tableName = table[Symbol.for("drizzle:Name")] || "unknown";
          return Promise.resolve(insertedRecords[tableName] || []);
        },
      }),
    };

    const result = await seed(mockDb);

    expect(result.localesCount).toBe(3);
    expect(result.booksCount).toBe(3);
    expect(result.chaptersCount).toBe(45);
    expect(result.freeChaptersCount).toBe(6);
    expect(result.gatedChaptersCount).toBe(39);
    expect(result.tiersCount).toBe(4);
    expect(result.tierBooksCount).toBe(6);
    expect(result.variantsCount).toBe(135);
  });
});
