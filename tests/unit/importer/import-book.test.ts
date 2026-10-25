import { describe, it, expect } from "vitest";
import { importBook } from "@/content/importer";

describe("importBook", () => {
  it("runs dry-run import for book-1 id/standar successfully without DB writes", async () => {
    const report = await importBook({
      bookId: "book-1",
      locale: "id",
      register: "standard",
      dryRun: true,
    });

    expect(report.bookId).toBe("book-1");
    expect(report.locale).toBe("id");
    expect(report.register).toBe("standard");
    expect(report.chaptersCount).toBe(15);
    expect(report.checklistItemsCount).toBe(34);
    expect(report.errors).toHaveLength(0);
  });

  it("runs dry-run import for English variant", async () => {
    const report = await importBook({
      bookId: "book-1",
      locale: "en",
      register: "standard",
      dryRun: true,
    });

    expect(report.bookId).toBe("book-1");
    expect(report.locale).toBe("en");
    expect(report.chaptersCount).toBe(15);
    expect(report.checklistItemsCount).toBe(34);
    expect(report.errors).toHaveLength(0);
  });

  it("performs upserts into content_drafts and checklist_items when not dry-run", async () => {
    const draftsUpserted: unknown[] = [];
    const checklistUpserted: unknown[] = [];

    const mockDb: any = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: "mock-book-id",
                  slug: "book-1",
                  chapterId: "mock-chapter-id",
                },
              ]),
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (val: any) => {
          const tableName = table[Symbol.for("drizzle:Name")] || "";
          if (tableName === "content_drafts") {
            draftsUpserted.push(val);
          } else if (tableName === "checklist_items") {
            checklistUpserted.push(val);
          }
          return {
            onConflictDoNothing: () => Promise.resolve([]),
            onConflictDoUpdate: () => Promise.resolve([]),
            returning: () =>
              Promise.resolve([{ id: "mock-id", ...(Array.isArray(val) ? val[0] : val) }]),
          };
        },
      }),
    };

    const report = await importBook(
      {
        bookId: "book-1",
        locale: "id",
        register: "standard",
        dryRun: false,
      },
      mockDb
    );

    expect(report.errors).toHaveLength(0);
    expect(report.chaptersCount).toBe(15);
    expect(report.checklistItemsCount).toBe(34);
    expect(draftsUpserted.length).toBe(15);
    expect(checklistUpserted.length).toBe(34);
  });
});
