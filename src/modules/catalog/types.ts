export interface BookSummary {
  id: string;
  slug: string;
  title: string;
  description?: string;
  activePriceIdr: bigint;
  availableLocales: string[];
  chaptersCount: number;
}

export interface ChapterSummary {
  slug: string;
  index: number;
  title: string;
  isFreeSample: boolean;
}

export interface BookTierSummary {
  id: string;
  code: string;
  amountIdr: bigint;
}

export interface BookDetail extends BookSummary {
  chapters: ChapterSummary[];
  tiers: BookTierSummary[];
}

export interface BundleOffer {
  tierId: string;
  code?: string;
  amountIdr: bigint;
  bookIds: string[];
}
