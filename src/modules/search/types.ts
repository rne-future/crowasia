export interface SearchResultItem {
  bookId: string;
  bookSlug: string;
  bookTitle: string;
  chapterSlug: string;
  chapterIndex: number;
  chapterTitle: string;
  isFreeSample: boolean;
  isOwned: boolean;
  previewText: string;
  snippetText?: string;
  highlights: string[];
  href: string;
}

export interface SearchResultDto {
  query: string;
  locale: string;
  total: number;
  results: SearchResultItem[];
}

export interface UserDashboardData {
  user: {
    id: string;
    email: string;
  };
  ownedBooks: Array<{
    bookId: string;
    slug: string;
    title: string;
    grantedAt: Date;
    latestProgress?: {
      chapterSlug: string;
      chapterTitle: string;
      lastSeenAt: Date;
    };
  }>;
  unclaimedOrders: Array<{
    orderId: string;
    createdAt: Date;
    amount: bigint;
    books: string[];
  }>;
}
