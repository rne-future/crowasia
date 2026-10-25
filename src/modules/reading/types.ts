export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export interface ChapterNavigationItem {
  slug: string;
  title: string;
  index?: number;
}

export interface ChapterReadPayload {
  bookId: string;
  bookSlug: string;
  bookTitle: string;
  chapterSlug: string;
  chapterIndex: number;
  chapterTitle: string;
  locale: string;
  register: string;
  isFreeSample: boolean;
  isAllowed: boolean;
  html?: string;
  previewText?: string;
  toc: Array<TocItem>;
  navigation: {
    prev?: ChapterNavigationItem;
    next?: ChapterNavigationItem;
  };
}
