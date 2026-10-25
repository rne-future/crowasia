import { randomUUID } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/shared/jobs/types";
import {
  orders,
  orderItems,
  checkoutRequests,
  verifiedPayments,
  purchaseGrants,
  manualGrants,
  purchaseClaims,
} from "@/shared/db/schema/commerce";
import { outboxJobs, webhookInbox } from "@/shared/db/schema/jobs";
import {
  books,
  chapters,
  chapterVariants,
  pricingTiers,
  tierBooks,
} from "@/shared/db/schema/catalog";
import {
  contentRevisions,
  publishedPreviews,
} from "@/shared/db/schema/content";
import { searchPublic, searchPrivate } from "@/shared/db/schema/search";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type CheckoutRequestRow = typeof checkoutRequests.$inferSelect;
export type VerifiedPaymentRow = typeof verifiedPayments.$inferSelect;
export type PurchaseGrantRow = typeof purchaseGrants.$inferSelect;
export type ManualGrantRow = typeof manualGrants.$inferSelect;
export type PurchaseClaimRow = typeof purchaseClaims.$inferSelect;
export type OutboxJobRow = typeof outboxJobs.$inferSelect;
export type WebhookInboxRow = typeof webhookInbox.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type ChapterRow = typeof chapters.$inferSelect;
export type ChapterVariantRow = typeof chapterVariants.$inferSelect;
export type PricingTierRow = typeof pricingTiers.$inferSelect;
export type TierBookRow = typeof tierBooks.$inferSelect;
export type ContentRevisionRow = typeof contentRevisions.$inferSelect;
export type PublishedPreviewRow = typeof publishedPreviews.$inferSelect;
export type SearchPublicRow = typeof searchPublic.$inferSelect;
export type SearchPrivateRow = typeof searchPrivate.$inferSelect;

export interface TestDbTables {
  orders: OrderRow[];
  order_items: OrderItemRow[];
  checkout_requests: CheckoutRequestRow[];
  verified_payments: VerifiedPaymentRow[];
  purchase_grants: PurchaseGrantRow[];
  manual_grants: ManualGrantRow[];
  purchase_claims: PurchaseClaimRow[];
  outbox_jobs: OutboxJobRow[];
  webhook_inbox: WebhookInboxRow[];
  books: BookRow[];
  chapters: ChapterRow[];
  chapter_variants: ChapterVariantRow[];
  pricing_tiers: PricingTierRow[];
  tier_books: TierBookRow[];
  content_revisions: ContentRevisionRow[];
  published_previews: PublishedPreviewRow[];
  search_public: SearchPublicRow[];
  search_private: SearchPrivateRow[];
}

function getTableName(tableObj: unknown): keyof TestDbTables {
  if (typeof tableObj === "object" && tableObj !== null) {
    try {
      const config = getTableConfig(tableObj as Parameters<typeof getTableConfig>[0]);
      if (config?.name) {
        return config.name as keyof TestDbTables;
      }
    } catch {
      // Fallback
    }
  }
  return "orders";
}

export function evaluateDrizzleCondition(
  row: Record<string, unknown>,
  cond: unknown
): boolean {
  if (!cond) return true;
  if (typeof cond !== "object" || cond === null) return true;
  const chunks = (cond as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return true;

  if (
    chunks.length === 3 &&
    typeof chunks[1] === "object" &&
    chunks[1] !== null &&
    "queryChunks" in chunks[1]
  ) {
    return evaluateDrizzleCondition(row, chunks[1]);
  }

  let hasAnd = false;
  let hasOr = false;
  for (const c of chunks) {
    if (
      c &&
      typeof c === "object" &&
      "value" in c &&
      Array.isArray((c as { value: unknown }).value)
    ) {
      const valArr = (c as { value: string[] }).value;
      const str = (valArr[0] || "").trim().toLowerCase();
      if (str === "and") hasAnd = true;
      if (str === "or") hasOr = true;
    }
  }

  if (hasAnd) {
    for (const c of chunks) {
      if (c && typeof c === "object" && "queryChunks" in c) {
        if (!evaluateDrizzleCondition(row, c)) return false;
      }
    }
    return true;
  }

  if (hasOr) {
    for (const c of chunks) {
      if (c && typeof c === "object" && "queryChunks" in c) {
        if (evaluateDrizzleCondition(row, c)) return true;
      }
    }
    return false;
  }

  let colName: string | undefined;
  let operator = "=";
  let targetVal: unknown;

  for (const c of chunks) {
    if (!c || typeof c !== "object") continue;
    if ("name" in c && typeof (c as { name: unknown }).name === "string") {
      colName = (c as { name: string }).name;
    } else if ("value" in c) {
      const v = (c as { value: unknown }).value;
      if (Array.isArray(v) && typeof v[0] === "string") {
        const opStr = v[0].trim().toLowerCase();
        if (["=", "is null", "is not null", "<=", ">", "in"].includes(opStr)) {
          operator = opStr;
        }
      } else {
        targetVal = v;
      }
    } else if (Array.isArray(c)) {
      operator = "in";
      targetVal = c.map((item: unknown) =>
        item && typeof item === "object" && "value" in item
          ? (item as { value: unknown }).value
          : item
      );
    }
  }

  if (!colName) return true;
  const camelCol = colName.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
  const actualVal = row[camelCol] !== undefined ? row[camelCol] : row[colName];

  if (operator === "is null") return actualVal === null || actualVal === undefined;
  if (operator === "is not null") return actualVal !== null && actualVal !== undefined;
  if (operator === "in") return Array.isArray(targetVal) && targetVal.includes(actualVal);
  if (operator === "<=") {
    if (actualVal instanceof Date && targetVal instanceof Date) {
      return actualVal.getTime() <= targetVal.getTime();
    }
    if (typeof actualVal === "bigint" && typeof targetVal === "bigint") {
      return actualVal <= targetVal;
    }
    if (typeof actualVal === "number" && typeof targetVal === "number") {
      return actualVal <= targetVal;
    }
    return String(actualVal) <= String(targetVal);
  }
  if (operator === ">") {
    if (actualVal instanceof Date && targetVal instanceof Date) {
      return actualVal.getTime() > targetVal.getTime();
    }
    if (typeof actualVal === "bigint" && typeof targetVal === "bigint") {
      return actualVal > targetVal;
    }
    if (typeof actualVal === "number" && typeof targetVal === "number") {
      return actualVal > targetVal;
    }
    return String(actualVal) > String(targetVal);
  }

  return actualVal === targetVal;
}

export interface TestDbOptions {
  onInsert?: (table: keyof TestDbTables, values: Record<string, unknown>) => void;
  mutexEnabled?: boolean;
}

class Mutex {
  private queue: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue;
    this.queue = current.then(() => next);
    await current;
    return release;
  }
}

export class TestDbHarness {
  public tables: TestDbTables;
  private options: TestDbOptions;
  private mutexes: Map<string, Mutex> = new Map();

  constructor(initialTables?: Partial<TestDbTables>, options: TestDbOptions = {}) {
    this.options = options;
    this.tables = {
      orders: initialTables?.orders ? [...initialTables.orders] : [],
      order_items: initialTables?.order_items ? [...initialTables.order_items] : [],
      checkout_requests: initialTables?.checkout_requests ? [...initialTables.checkout_requests] : [],
      verified_payments: initialTables?.verified_payments ? [...initialTables.verified_payments] : [],
      purchase_grants: initialTables?.purchase_grants ? [...initialTables.purchase_grants] : [],
      manual_grants: initialTables?.manual_grants ? [...initialTables.manual_grants] : [],
      purchase_claims: initialTables?.purchase_claims ? [...initialTables.purchase_claims] : [],
      outbox_jobs: initialTables?.outbox_jobs ? [...initialTables.outbox_jobs] : [],
      webhook_inbox: initialTables?.webhook_inbox ? [...initialTables.webhook_inbox] : [],
      books: initialTables?.books ? [...initialTables.books] : [],
      chapters: initialTables?.chapters ? [...initialTables.chapters] : [],
      chapter_variants: initialTables?.chapter_variants ? [...initialTables.chapter_variants] : [],
      pricing_tiers: initialTables?.pricing_tiers ? [...initialTables.pricing_tiers] : [],
      tier_books: initialTables?.tier_books ? [...initialTables.tier_books] : [],
      content_revisions: initialTables?.content_revisions ? [...initialTables.content_revisions] : [],
      published_previews: initialTables?.published_previews ? [...initialTables.published_previews] : [],
      search_public: initialTables?.search_public ? [...initialTables.search_public] : [],
      search_private: initialTables?.search_private ? [...initialTables.search_private] : [],
    };
  }

  private cloneTables(source: TestDbTables): TestDbTables {
    const copy = {} as Record<keyof TestDbTables, unknown[]>;
    for (const key of Object.keys(source) as (keyof TestDbTables)[]) {
      copy[key] = (source[key] as Record<string, unknown>[]).map((row) => ({ ...row }));
    }
    return copy as unknown as TestDbTables;
  }

  public getDb(): DbOrTx {
    return this.createClient(null, false) as unknown as DbOrTx;
  }

  private getMutex(key: string): Mutex {
    let m = this.mutexes.get(key);
    if (!m) {
      m = new Mutex();
      this.mutexes.set(key, m);
    }
    return m;
  }

  private createClient(shadowTables: TestDbTables | null, inTx: boolean): unknown {
    const getActiveTables = (): TestDbTables => shadowTables ?? this.tables;
    const activeLockReleases: (() => void)[] = [];

    const client = {
      select: (_fields?: unknown) => {
        let fromTable: keyof TestDbTables = "orders";
        let innerJoinTable: keyof TestDbTables | null = null;
        let whereCond: unknown = null;
        let limitCount: number | null = null;
        let isForUpdate = false;
        let orderDirection: "asc" | "desc" | null = null;
        let orderCol: string | null = null;

        const executeQuery = () => {
          const tables = getActiveTables();
          let rows = [...(tables[fromTable] || [])] as Record<string, unknown>[];

          if (innerJoinTable) {
            // Minimal join support for tier_books + books
            if (fromTable === "tier_books" && innerJoinTable === "books") {
              const joined: Record<string, unknown>[] = [];
              for (const tb of tables.tier_books) {
                const book = tables.books.find((b) => b.id === tb.bookId);
                if (book) {
                  joined.push({
                    id: book.id,
                    slug: book.slug,
                    title: book.title,
                    tierId: tb.tierId,
                    bookId: tb.bookId,
                  });
                }
              }
              rows = joined;
            }
          }

          if (whereCond) {
            rows = rows.filter((r) => evaluateDrizzleCondition(r, whereCond));
          }

          if (orderCol) {
            rows.sort((a, b) => {
              const aVal = a[orderCol!] as string | number | Date;
              const bVal = b[orderCol!] as string | number | Date;
              const aTime = aVal instanceof Date ? aVal.getTime() : aVal;
              const bTime = bVal instanceof Date ? bVal.getTime() : bVal;
              if (aTime < bTime) return orderDirection === "desc" ? 1 : -1;
              if (aTime > bTime) return orderDirection === "desc" ? -1 : 1;
              return 0;
            });
          }

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          return rows;
        };

        const queryObj: {
          from: (table: unknown) => typeof queryObj;
          innerJoin: (joinTable: unknown, condition: unknown) => typeof queryObj;
          where: (cond: unknown) => typeof queryObj;
          for: (mode: string, opts?: unknown) => typeof queryObj;
          orderBy: (...clauses: unknown[]) => typeof queryObj;
          limit: (n: number) => typeof queryObj;
          then: (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => Promise<unknown>;
        } = {
          from: (table: unknown) => {
            fromTable = getTableName(table);
            return queryObj;
          },
          innerJoin: (joinTable: unknown, _condition: unknown) => {
            innerJoinTable = getTableName(joinTable);
            return queryObj;
          },
          where: (cond: unknown) => {
            whereCond = cond;
            return queryObj;
          },
          for: (_mode: string, _opts?: unknown) => {
            isForUpdate = true;
            return queryObj;
          },
          orderBy: (...clauses: unknown[]) => {
            if (clauses.length > 0) {
              const clause = clauses[0] as { queryChunks?: unknown[] } | undefined;
              if (clause?.queryChunks) {
                for (const chunk of clause.queryChunks) {
                  if (chunk && typeof chunk === "object" && "name" in chunk) {
                    orderCol = (chunk as { name: string }).name;
                  }
                  if (
                    chunk &&
                    typeof chunk === "object" &&
                    "value" in chunk &&
                    Array.isArray((chunk as { value: unknown }).value)
                  ) {
                    const str = (chunk as { value: string[] }).value[0] || "";
                    if (str.includes("desc")) orderDirection = "desc";
                    if (str.includes("asc")) orderDirection = "asc";
                  }
                }
              }
            }
            return queryObj;
          },
          limit: (n: number) => {
            limitCount = n;
            return queryObj;
          },
          then: async (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => {
            try {
              if (isForUpdate) {
                let lockKey = `${fromTable}-all`;
                if (whereCond) {
                  const condChunks = (whereCond as { queryChunks?: unknown[] }).queryChunks;
                  if (Array.isArray(condChunks)) {
                    for (const c of condChunks) {
                      if (
                        c &&
                        typeof c === "object" &&
                        "value" in c &&
                        typeof (c as { value: unknown }).value === "string"
                      ) {
                        lockKey = `${fromTable}-${(c as { value: string }).value}`;
                        break;
                      }
                    }
                  }
                }
                const release = await this.getMutex(lockKey).acquire();
                activeLockReleases.push(release);

                // Re-sync shadow tables from latest committed tables
                if (shadowTables) {
                  for (const key of Object.keys(this.tables) as (keyof TestDbTables)[]) {
                    shadowTables[key] = (this.tables[key] as Record<string, unknown>[]).map((r) => ({
                      ...r,
                    })) as never;
                  }
                }
              }
              const res = executeQuery();
              resolve(res);
            } catch (err) {
              if (reject) reject(err);
              else throw err;
            }
          },
        };

        return queryObj;
      },

      insert: (tableObj: unknown) => {
        const table = getTableName(tableObj);
        return {
          values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
            const rawList = Array.isArray(vals) ? vals : [vals];
            const insertedList: Record<string, unknown>[] = [];
            const targetTables = getActiveTables();

            for (const v of rawList) {
              if (this.options.onInsert) {
                this.options.onInsert(table, v);
              }

              const row: Record<string, unknown> = {
                id: (v.id as string) ?? randomUUID(),
                ...v,
                createdAt: (v.createdAt as Date) ?? new Date(),
                updatedAt: (v.updatedAt as Date) ?? new Date(),
              };

              insertedList.push(row);
              const targetArr = targetTables[table] as Record<string, unknown>[];
              targetArr.push(row);
            }

            const insertRes: {
              onConflictDoNothing: () => Promise<Record<string, unknown>[]>;
              returning: (fields?: unknown) => Promise<Record<string, unknown>[]>;
              then: (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => Promise<unknown>;
            } = {
              onConflictDoNothing: async () => insertedList,
              returning: async () => insertedList,
              then: (resolve, reject) => Promise.resolve(insertedList).then(resolve, reject),
            };

            return insertRes;
          },
        };
      },

      update: (tableObj: unknown) => {
        const table = getTableName(tableObj);
        return {
          set: (setVals: Record<string, unknown>) => ({
            where: (cond: unknown) => {
              const matchedRows: Record<string, unknown>[] = [];
              const targetTables = getActiveTables();
              const arr = targetTables[table] as Record<string, unknown>[];

              for (const row of arr) {
                if (evaluateDrizzleCondition(row, cond)) {
                  // Special check for single-use CAS usedAt in purchaseClaims
                  if (table === "purchase_claims" && setVals.usedAt && row.usedAt) {
                    continue;
                  }
                  Object.assign(row, setVals);
                  matchedRows.push(row);
                }
              }

              const updateRes: {
                returning: (fields?: unknown) => Promise<Record<string, unknown>[]>;
                then: (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => Promise<unknown>;
              } = {
                returning: async () => matchedRows,
                then: (resolve, reject) => Promise.resolve(matchedRows).then(resolve, reject),
              };

              return updateRes;
            },
          }),
        };
      },

      transaction: async <T>(callback: (tx: DbOrTx) => Promise<T>): Promise<T> => {
        if (inTx) {
          return await callback(client as unknown as DbOrTx);
        }

        // Create shadow copy for rollback isolation
        const shadow = this.cloneTables(this.tables);
        const txClient = this.createClient(shadow, true) as {
          [key: string]: unknown;
          _releaseLocks?: () => void;
        };

        try {
          const result = await callback(txClient as unknown as DbOrTx);
          // Commit: transfer shadow tables into main tables
          for (const key of Object.keys(shadow) as (keyof TestDbTables)[]) {
            this.tables[key] = shadow[key] as never;
          }
          return result;
        } catch (error) {
          // Rollback: shadow is discarded, main tables untouched!
          throw error;
        } finally {
          txClient._releaseLocks?.();
        }
      },

      _releaseLocks: () => {
        for (const release of activeLockReleases) {
          release();
        }
        activeLockReleases.length = 0;
      },
    };

    return client;
  }
}

/**
 * Standard test catalog seeder providing:
 * - 3 books (Mahir Memimpin Tim, Napas Panjang, Melipatgandakan Dampak Tim)
 * - 15 chapters each (indices 0..14; 0 and 1 are free samples)
 * - Chapter variants and revisions
 * - Published previews for paid chapters
 * - Pricing tiers (bundle-3-books @ 299,000 IDR, single-book @ 149,000 IDR)
 * - Search public and private catalog records
 */
export function seedStandardCatalog(harness: TestDbHarness): {
  book1: BookRow;
  book2: BookRow;
  book3: BookRow;
  bundleTier: PricingTierRow;
  singleTier: PricingTierRow;
} {
  const book1: BookRow = {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "mahir-memimpin-tim",
    status: "published",
    title: "Mahir Memimpin Tim",
    description: "Buku 1 Panduan Praktis Lead Baru",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  const book2: BookRow = {
    id: "22222222-2222-2222-2222-222222222222",
    slug: "napas-panjang",
    status: "published",
    title: "Napas Panjang Memimpin Tim",
    description: "Buku 2 Mengelola Energi dan Burnout",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  const book3: BookRow = {
    id: "33333333-3333-3333-3333-333333333333",
    slug: "melipatgandakan-dampak",
    status: "published",
    title: "Melipatgandakan Dampak Tim",
    description: "Buku 3 Skalabilitas Organisasi",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  harness.tables.books = [book1, book2, book3];

  const bundleTier: PricingTierRow = {
    id: "tier-bundle-3-books",
    code: "bundle-3-books",
    amountIdr: 299000n,
    status: "active",
    version: 1,
    termsVersion: "2026-10-25",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  const singleTier: PricingTierRow = {
    id: "tier-single-book-1",
    code: "single-book-1",
    amountIdr: 149000n,
    status: "active",
    version: 1,
    termsVersion: "2026-10-25",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  harness.tables.pricing_tiers = [bundleTier, singleTier];

  harness.tables.tier_books = [
    { tierId: bundleTier.id, bookId: book1.id },
    { tierId: bundleTier.id, bookId: book2.id },
    { tierId: bundleTier.id, bookId: book3.id },
    { tierId: singleTier.id, bookId: book1.id },
  ];

  // Seed 15 chapters for each book
  const allBooks = [book1, book2, book3];
  for (const b of allBooks) {
    for (let idx = 0; idx < 15; idx++) {
      const chId = `ch-${b.slug}-${idx}`;
      const varId = `var-${b.slug}-${idx}-id-std`;
      const revId = `rev-${b.slug}-${idx}`;
      const isFree = idx === 0 || idx === 1;

      harness.tables.chapters.push({
        id: chId,
        bookId: b.id,
        index: idx,
        slug: `ch-${idx}`,
        isFreeSample: isFree,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      harness.tables.chapter_variants.push({
        id: varId,
        chapterId: chId,
        locale: "id",
        register: "standard",
        publishedRevisionId: revId,
        generation: 1,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      let title =
        idx === 0
          ? `Pendahuluan: Memimpin ${b.title}`
          : idx === 1
          ? `Bab 1: Menyiapkan Pondasi ${b.title}`
          : `Bab ${idx}: Kunci Pengelolaan ${b.title}`;

      let paidContent = `<article><h1 id="title-${idx}">${title}</h1><p>Konten rahasia berbayar bab ${idx} untuk ${b.title}.</p></article>`;
      let secretKeyword = "";

      if (b.slug === "mahir-memimpin-tim" && idx === 3) {
        secretKeyword = "CLASSIFIED_EXECUTIVE_PLAYBOOK_777";
        paidContent = `<article><h1 id="title-3">Bab 3: Eksekusi Rahasia Tim</h1><p>Gunakan rahasia ${secretKeyword} untuk mendominasi pasar.</p></article>`;
      }

      if (idx === 7) {
        if (b.slug === "mahir-memimpin-tim") {
          title = "Obrolan 1: Menyepakati Target di Awal (Rumus 3K)";
          secretKeyword = "Praktikkan Rumus 3K (Keluaran, Kriteria Sukses, Kalender)";
        } else if (b.slug === "napas-panjang") {
          title = "Langkah 1: Mengaudit Kalender & Memangkas Rutinitas Mubazir (Rumus 3P)";
          secretKeyword = "Praktikkan Rumus 3P (Pangkas, Pindahkan, Pertahankan)";
        } else if (b.slug === "melipatgandakan-dampak") {
          title = "Forum 1: Menyelaraskan Sasaran Antar-Tim di Awal Kuartal (Rumus 3S)";
          secretKeyword = "Praktikkan Rumus 3S (Sasaran Bersama, Sekat Peran, Simpul Koordinasi)";
        }
      }

      harness.tables.content_revisions.push({
        id: revId,
        variantId: varId,
        sourceMd: `# ${title}\n\nKonten rahasia bab ${idx}.`,
        sourceSha256: `src-sha-${idx}`,
        manifestSha256: `man-sha-${idx}`,
        compilerVersion: "1.0",
        sanitizerVersion: "1.0",
        html: paidContent,
        metadataJson: { title, tasksCount: 3 },
        createdBy: null,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      if (!isFree) {
        harness.tables.published_previews.push({
          variantId: varId,
          version: 1,
          previewText: `Pratinjau resmi bab ${idx} untuk ${b.title}. Dapatkan akses penuh dengan membeli buku ini.`,
          previewHtml: `<p>Pratinjau resmi bab ${idx}</p>`,
          approvedBy: null,
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        });
      }

      // Search records
      harness.tables.search_public.push({
        variantId: varId,
        revisionId: revId,
        title,
        previewText: `Pratinjau resmi bab ${idx} untuk ${b.title}.`,
        tags: [b.slug, `bab-${idx}`, "strategi"],
        document: `doc-public-${varId}`,
      });

      harness.tables.search_private.push({
        variantId: varId,
        revisionId: revId,
        text: `${title}. Konten rahasia berbayar bab ${idx} ${secretKeyword}`.trim(),
        document: `doc-private-${varId}`,
      });
    }
  }

  return { book1, book2, book3, bundleTier, singleTier };
}
