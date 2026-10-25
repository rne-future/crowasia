export interface ChapterSplit {
  slug: string;
  index: number;
  title: string;
  source: string;
  startLine: number;
  endLine: number;
  isFreeSample: boolean;
}

export interface BookMetadata {
  title?: string;
  author?: string;
  tone?: string;
  format?: string;
  frontmatterLines: [number, number];
  tocLines: [number, number];
}

export interface ChapterManifest {
  chapter_slug: string;
  chapter_index: number;
  title: string;
  source_start_line: number;
  source_end_line: number;
  is_free_sample: boolean;
  checklist_item_ids: string[];
}

export interface BookManifest {
  book_id: string;
  source_file?: string;
  source_sha256?: string;
  locale?: string;
  register?: string;
  author?: string;
  title?: string;
  frontmatter_lines?: [number, number];
  toc_lines?: [number, number];
  chapters: ChapterManifest[];
}

export interface ImportManifestFile {
  schema_version: number;
  note?: string;
  books: BookManifest[];
}

export interface GeneratedManifest {
  schema_version: number;
  book_id: string;
  source_sha256?: string;
  locale: string;
  register: "standard" | "casual";
  frontmatter_lines?: [number, number];
  toc_lines?: [number, number];
  chapters: ChapterManifest[];
}

export interface ImportOptions {
  bookId: string;
  locale: string;
  register: "standard" | "casual";
  sourcePath?: string;
  sourceContent?: string;
  dryRun?: boolean;
}

export interface ImportReport {
  bookId: string;
  locale: string;
  register: string;
  chaptersCount: number;
  checklistItemsCount: number;
  warnings: string[];
  errors: string[];
}
