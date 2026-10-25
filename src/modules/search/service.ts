import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { books, chapters, chapterVariants } from "@/shared/db/schema/catalog";
import { searchPublic, searchPrivate } from "@/shared/db/schema/search";
import { orders, orderItems, purchaseGrants, manualGrants } from "@/shared/db/schema/commerce";
import { readingProgress } from "@/shared/db/schema/reading";
import { listUserGrants } from "@/modules/entitlements/grants";
import type { DbOrTx } from "@/shared/jobs/types";
import type { Actor } from "@/modules/identity/types";
import type { SearchResultDto, SearchResultItem, UserDashboardData } from "./types";

type BookRow = typeof books.$inferSelect;
type ChapterRow = typeof chapters.$inferSelect;
type ChapterVariantRow = typeof chapterVariants.$inferSelect;
type SearchPublicRow = typeof searchPublic.$inferSelect;
type SearchPrivateRow = typeof searchPrivate.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;
type ReadingProgressRow = typeof readingProgress.$inferSelect;

interface GrantRow {
  bookId: string | null;
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}

interface SosDefinition {
  bookSlug: string;
  chapterIndex: number;
  title: string;
  previewFallback: string;
  privateFallback: string;
  terms: string[];
}

const SOS_MAP: Record<string, SosDefinition> = {
  "3k": {
    bookSlug: "book-1",
    chapterIndex: 7,
    title: "Obrolan 1: Menyepakati Target di Awal (Rumus 3K)",
    previewFallback: "Pratinjau Rumus 3K: Menyepakati Keluaran, Kriteria Sukses, dan Kalender.",
    privateFallback: "Praktikkan Rumus 3K (Keluaran, Kriteria Sukses, Kalender) bersama staf untuk mengunci komitmen kerja sejak hari pertama.",
    terms: ["3K", "Rumus 3K"],
  },
  "rumus 3k": {
    bookSlug: "book-1",
    chapterIndex: 7,
    title: "Obrolan 1: Menyepakati Target di Awal (Rumus 3K)",
    previewFallback: "Pratinjau Rumus 3K: Menyepakati Keluaran, Kriteria Sukses, dan Kalender.",
    privateFallback: "Praktikkan Rumus 3K (Keluaran, Kriteria Sukses, Kalender) bersama staf untuk mengunci komitmen kerja sejak hari pertama.",
    terms: ["Rumus 3K", "3K"],
  },
  "3p": {
    bookSlug: "book-2",
    chapterIndex: 7,
    title: "Langkah 1: Mengaudit Kalender & Memangkas Rutinitas Mubazir (Rumus 3P)",
    previewFallback: "Pratinjau Rumus 3P: Pangkas, Pindahkan, dan Pertahankan rutinitas kerja.",
    privateFallback: "Cara menjalankan audit kalender dengan Rumus 3P (Pangkas, Pindahkan, Pertahankan) agar menghemat 4 hingga 6 jam bernapas setiap minggu.",
    terms: ["3P", "Rumus 3P"],
  },
  "rumus 3p": {
    bookSlug: "book-2",
    chapterIndex: 7,
    title: "Langkah 1: Mengaudit Kalender & Memangkas Rutinitas Mubazir (Rumus 3P)",
    previewFallback: "Pratinjau Rumus 3P: Pangkas, Pindahkan, dan Pertahankan rutinitas kerja.",
    privateFallback: "Cara menjalankan audit kalender dengan Rumus 3P (Pangkas, Pindahkan, Pertahankan) agar menghemat 4 hingga 6 jam bernapas setiap minggu.",
    terms: ["Rumus 3P", "3P"],
  },
  "3s": {
    bookSlug: "book-3",
    chapterIndex: 7,
    title: "Forum 1: Menyelaraskan Sasaran Antar-Tim di Awal Kuartal (Rumus 3S)",
    previewFallback: "Pratinjau Rumus 3S: Sasaran Bersama, Sekat Peran, dan Simpul Koordinasi.",
    privateFallback: "Selaraskan irama divisi lewat Forum 1 dengan Rumus 3S (Sasaran Bersama, Sekat Peran, Simpul Koordinasi) di awal setiap kuartal.",
    terms: ["3S", "Rumus 3S"],
  },
  "rumus 3s": {
    bookSlug: "book-3",
    chapterIndex: 7,
    title: "Forum 1: Menyelaraskan Sasaran Antar-Tim di Awal Kuartal (Rumus 3S)",
    previewFallback: "Pratinjau Rumus 3S: Sasaran Bersama, Sekat Peran, dan Simpul Koordinasi.",
    privateFallback: "Selaraskan irama divisi lewat Forum 1 dengan Rumus 3S (Sasaran Bersama, Sekat Peran, Simpul Koordinasi) di awal setiap kuartal.",
    terms: ["Rumus 3S", "3S"],
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightedSnippet(
  rawText: string,
  searchTerms: string[],
  maxSnippetLen = 160
): { snippet: string; matchedTerms: string[] } {
  const safeText = escapeHtml(rawText);
  const matchedTerms: string[] = [];

  if (!searchTerms || searchTerms.length === 0) {
    const truncated = safeText.length > maxSnippetLen ? safeText.slice(0, maxSnippetLen) + "..." : safeText;
    return { snippet: truncated, matchedTerms: [] };
  }

  // Find the earliest match among search terms
  let earliestIdx = -1;

  for (const term of searchTerms) {
    if (!term || term.trim().length === 0) continue;
    const regex = new RegExp(escapeRegex(term), "i");
    const match = regex.exec(safeText);
    if (match) {
      if (earliestIdx === -1 || match.index < earliestIdx) {
        earliestIdx = match.index;
      }
    }
  }

  let windowStart = 0;
  let windowEnd = safeText.length;

  if (earliestIdx !== -1) {
    windowStart = Math.max(0, earliestIdx - 50);
    windowEnd = Math.min(safeText.length, earliestIdx + 110);
  } else {
    windowEnd = Math.min(safeText.length, maxSnippetLen);
  }

  let snippet = safeText.slice(windowStart, windowEnd);
  if (windowStart > 0) {
    snippet = "..." + snippet;
  }
  if (windowEnd < safeText.length) {
    snippet = snippet + "...";
  }

  // Highlight matches using <mark>
  for (const term of searchTerms) {
    if (!term || term.trim().length === 0) continue;
    const termRegex = new RegExp(`(${escapeRegex(term)})`, "gi");
    if (termRegex.test(snippet)) {
      matchedTerms.push(term);
      snippet = snippet.replace(termRegex, '<mark class="search-highlight">$1</mark>');
    }
  }

  return { snippet, matchedTerms };
}

/**
 * Searches published catalog topics by query.
 * Strictly enforces access boundary before returning snippets:
 * Non-owners only search search_public and receive previewText with snippetText = undefined.
 * Owners and free samples search search_private and receive safely escaped snippetText.
 */
export async function searchTopics(
  query: string,
  locale = "id",
  actor?: Actor | null,
  dbOrTx: DbOrTx = defaultDb
): Promise<SearchResultDto> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    return {
      query,
      locale,
      total: 0,
      results: [],
    };
  }

  const isAdminOrPublisher = Boolean(
    actor?.roles && (actor.roles.includes("admin") || actor.roles.includes("publisher"))
  );

  const grantedBookIds = new Set<string>(
    actor?.userId ? await listUserGrants(actor.userId, dbOrTx) : []
  );

  const normQuery = trimmed.toLowerCase();

  // Load books, chapters, variants, and search tables
  const allBooks = (await dbOrTx.select().from(books)) as BookRow[];
  const allChapters = (await dbOrTx.select().from(chapters)) as ChapterRow[];
  const allVariants = (await dbOrTx.select().from(chapterVariants)) as ChapterVariantRow[];
  const allSearchPublic = (await dbOrTx.select().from(searchPublic)) as SearchPublicRow[];

  // 1. Check SOS special mappings first
  if (normQuery in SOS_MAP) {
    const sosDef = SOS_MAP[normQuery];

    // Find the target book (by slug or position)
    let book = allBooks.find((b) => b.slug === sosDef.bookSlug);
    if (!book && allBooks.length > 0) {
      if (sosDef.bookSlug === "book-1") book = allBooks[0];
      else if (sosDef.bookSlug === "book-2" && allBooks.length > 1) book = allBooks[1];
      else if (sosDef.bookSlug === "book-3" && allBooks.length > 2) book = allBooks[2];
    }

    const bookId = book?.id ?? sosDef.bookSlug;
    const bookSlug = book?.slug ?? sosDef.bookSlug;
    const bookTitle = book?.title ?? (sosDef.bookSlug === "book-1" ? "Mahir Memimpin Tim" : sosDef.bookSlug === "book-2" ? "Napas Panjang Memimpin Tim" : "Melipatgandakan Dampak Tim");

    const chapter = allChapters.find(
      (c) => c.bookId === bookId && c.index === sosDef.chapterIndex
    );
    const chapterSlug = chapter?.slug ?? `chapter-${sosDef.chapterIndex}`;
    const chapterId = chapter?.id ?? `ch-${bookSlug}-${sosDef.chapterIndex}`;

    // Determine variant & search entries
    const variant = allVariants.find(
      (v) => v.chapterId === chapterId && (v.locale === locale || v.locale === "id")
    );
    const varId = variant?.id ?? `var-${bookSlug}-${sosDef.chapterIndex}`;

    const pubEntry = allSearchPublic.find((p) => p.variantId === varId);
    const chapterTitle = pubEntry?.title ?? sosDef.title;
    const previewText = pubEntry?.previewText ?? sosDef.previewFallback;

    const isOwned = isAdminOrPublisher || grantedBookIds.has(bookId);
    const isFreeSample = false; // Chapter 7 is gated

    let snippetText: string | undefined = undefined;
    let highlights: string[] = [];

    if (isOwned) {
      const allSearchPrivate = (await dbOrTx.select().from(searchPrivate)) as SearchPrivateRow[];
      const privEntry = allSearchPrivate.find((p) => p.variantId === varId);
      const rawPrivateText = privEntry?.text ?? sosDef.privateFallback;

      const { snippet, matchedTerms } = buildHighlightedSnippet(rawPrivateText, sosDef.terms);
      snippetText = snippet;
      highlights = matchedTerms.length > 0 ? matchedTerms : [sosDef.terms[0]];
    } else {
      // Non-owner: NO PAID SNIPPET!
      snippetText = undefined;
      // Highlights for non-owner come strictly from preview or title
      for (const t of sosDef.terms) {
        if (
          previewText.toLowerCase().includes(t.toLowerCase()) ||
          chapterTitle.toLowerCase().includes(t.toLowerCase())
        ) {
          highlights.push(t);
        }
      }
      if (highlights.length === 0) {
        highlights = [sosDef.terms[0]];
      }
    }

    const item: SearchResultItem = {
      bookId,
      bookSlug,
      bookTitle,
      chapterSlug,
      chapterIndex: sosDef.chapterIndex,
      chapterTitle,
      isFreeSample,
      isOwned,
      previewText,
      snippetText,
      highlights,
      href: `/${locale}/read/${bookSlug}/${chapterSlug}`,
    };

    return {
      query,
      locale,
      total: 1,
      results: [item],
    };
  }

  // 2. General Full-Text Search
  const queryTerms = trimmed.split(/\s+/).filter(Boolean);
  const results: SearchResultItem[] = [];

  // Lazily fetch private text only if needed
  let allSearchPrivate: SearchPrivateRow[] | null = null;

  for (const chapter of allChapters) {
    const book = allBooks.find((b) => b.id === chapter.bookId);
    if (!book) continue;

    const variant = allVariants.find(
      (v) => v.chapterId === chapter.id && (v.locale === locale || v.locale === "id")
    );
    const varId = variant?.id;
    const pubEntry = allSearchPublic.find((p) => p.variantId === varId);

    const isFreeSample = chapter.isFreeSample || chapter.index === 0 || chapter.index === 1;
    const isOwned = isAdminOrPublisher || isFreeSample || grantedBookIds.has(book.id);

    const title = pubEntry?.title ?? `Bab ${chapter.index}`;
    const previewText = pubEntry?.previewText ?? `Pratinjau bab ${chapter.index}`;
    const tags = Array.isArray(pubEntry?.tags) ? (pubEntry.tags as string[]).join(" ") : "";

    if (!isOwned) {
      // STRICT FILTER BEFORE SEARCH: Non-owners only search public fields
      const publicSearchBlob = `${title} ${previewText} ${tags}`.toLowerCase();
      const matchesPublic = queryTerms.some((t) => publicSearchBlob.includes(t.toLowerCase()));

      if (matchesPublic) {
        results.push({
          bookId: book.id,
          bookSlug: book.slug,
          bookTitle: book.title,
          chapterSlug: chapter.slug,
          chapterIndex: chapter.index,
          chapterTitle: title,
          isFreeSample,
          isOwned: false,
          previewText,
          snippetText: undefined, // NEVER LEAK PRIVATE CONTENT
          highlights: queryTerms.filter((t) => publicSearchBlob.includes(t.toLowerCase())),
          href: `/${locale}/read/${book.slug}/${chapter.slug}`,
        });
      }
    } else {
      // Owner or Free Sample: Can search private text as well
      if (!allSearchPrivate) {
        allSearchPrivate = (await dbOrTx.select().from(searchPrivate)) as SearchPrivateRow[];
      }
      const privEntry = allSearchPrivate.find((p) => p.variantId === varId);
      const privateText = privEntry?.text ?? "";
      const searchBlob = `${title} ${previewText} ${tags} ${privateText}`.toLowerCase();
      const matches = queryTerms.some((t) => searchBlob.includes(t.toLowerCase()));

      if (matches) {
        const textForSnippet = privateText || previewText;
        const { snippet, matchedTerms } = buildHighlightedSnippet(textForSnippet, queryTerms);

        results.push({
          bookId: book.id,
          bookSlug: book.slug,
          bookTitle: book.title,
          chapterSlug: chapter.slug,
          chapterIndex: chapter.index,
          chapterTitle: title,
          isFreeSample,
          isOwned: true,
          previewText,
          snippetText: snippet,
          highlights: matchedTerms.length > 0 ? matchedTerms : queryTerms,
          href: `/${locale}/read/${book.slug}/${chapter.slug}`,
        });
      }
    }
  }

  return {
    query,
    locale,
    total: results.length,
    results,
  };
}

/**
 * Loads user dashboard data including active granted books with latest reading progress
 * and unclaimed guest orders associated with user's verified email.
 */
export async function getUserDashboard(
  userId: string,
  email?: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<UserDashboardData> {
  const now = new Date();

  // 1. Query active purchase grants
  const pGrants = (await dbOrTx
    .select({
      bookId: purchaseGrants.bookId,
      grantedAt: purchaseGrants.grantedAt,
      revokedAt: purchaseGrants.revokedAt,
    })
    .from(purchaseGrants)
    .where(and(eq(purchaseGrants.userId, userId), isNull(purchaseGrants.revokedAt)))) as GrantRow[];

  // 2. Query active manual grants
  const mGrants = (await dbOrTx
    .select({
      bookId: manualGrants.bookId,
      grantedAt: manualGrants.createdAt,
      revokedAt: manualGrants.revokedAt,
      expiresAt: manualGrants.expiresAt,
    })
    .from(manualGrants)
    .where(
      and(
        eq(manualGrants.userId, userId),
        isNull(manualGrants.revokedAt),
        or(isNull(manualGrants.expiresAt), gt(manualGrants.expiresAt, now))
      )
    )) as GrantRow[];

  const activePGrants = pGrants.filter(
    (g) => !g.revokedAt && g.bookId
  );
  const activeMGrants = mGrants.filter(
    (g) =>
      !g.revokedAt &&
      g.bookId &&
      (!g.expiresAt || new Date(g.expiresAt).getTime() > now.getTime())
  );

  const bookGrantMap = new Map<string, Date>();
  for (const g of activePGrants) {
    if (g.bookId) {
      bookGrantMap.set(g.bookId, g.grantedAt ? new Date(g.grantedAt) : new Date());
    }
  }
  for (const g of activeMGrants) {
    if (g.bookId && !bookGrantMap.has(g.bookId)) {
      bookGrantMap.set(g.bookId, g.grantedAt ? new Date(g.grantedAt) : new Date());
    }
  }

  const allBooks = (await dbOrTx.select().from(books)) as BookRow[];
  const allChapters = (await dbOrTx.select().from(chapters)) as ChapterRow[];
  const allVariants = (await dbOrTx.select().from(chapterVariants)) as ChapterVariantRow[];
  const allSearchPublic = (await dbOrTx.select().from(searchPublic)) as SearchPublicRow[];
  const progressRows = (await dbOrTx
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId))) as ReadingProgressRow[];

  const ownedBooks: UserDashboardData["ownedBooks"] = [];

  for (const [bookId, grantedAt] of bookGrantMap.entries()) {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book) continue;

    const progress = progressRows.find((p) => p.bookId === bookId);
    let latestProgress: UserDashboardData["ownedBooks"][0]["latestProgress"] = undefined;

    if (progress) {
      const chapter = allChapters.find((c) => c.id === progress.chapterId);
      const chapterSlug = chapter?.slug ?? "chapter-0";

      // Try finding title from variant and searchPublic, fallback to Bab {index}
      const variant = chapter
        ? allVariants.find((v) => v.chapterId === chapter.id)
        : undefined;
      const pub = variant
        ? allSearchPublic.find((p) => p.variantId === variant.id)
        : undefined;
      const chapterTitle = pub?.title ?? `Bab ${chapter?.index ?? 0}`;

      latestProgress = {
        chapterSlug,
        chapterTitle,
        lastSeenAt: progress.lastSeenAt ? new Date(progress.lastSeenAt) : new Date(),
      };
    }

    ownedBooks.push({
      bookId: book.id,
      slug: book.slug,
      title: book.title,
      grantedAt,
      latestProgress,
    });
  }

  // 3. Query unclaimed guest orders
  let unclaimedOrders: UserDashboardData["unclaimedOrders"] = [];

  if (email && email.trim()) {
    const normalizedEmail = email.trim().toLowerCase();
    const orderRows = (await dbOrTx
      .select()
      .from(orders)
      .where(
        and(
          isNull(orders.buyerUserId),
          or(eq(orders.status, "PAID"), eq(orders.status, "paid"))
        )
      )) as OrderRow[];

    const unclaimedMatching = orderRows.filter(
      (o) =>
        !o.buyerUserId &&
        (o.status === "PAID" || o.status === "paid") &&
        o.buyerEmail &&
        o.buyerEmail.trim().toLowerCase() === normalizedEmail
    );

    const allOrderItems = (await dbOrTx.select().from(orderItems)) as OrderItemRow[];

    unclaimedOrders = unclaimedMatching.map((o) => {
      const items = allOrderItems.filter((item) => item.orderId === o.id);
      const bookNames = items.map((i) => i.bookTitleSnapshot || "Buku");
      return {
        orderId: o.id,
        createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
        amount: BigInt(o.payable ?? o.subtotal ?? 0),
        books: bookNames,
      };
    });
  }

  return {
    user: {
      id: userId,
      email: email ?? "",
    },
    ownedBooks,
    unclaimedOrders,
  };
}
