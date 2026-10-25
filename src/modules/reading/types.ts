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

export interface ChecklistProgressResult {
  itemId: string;
  completed: boolean;
  version: number;
  updatedAt: Date;
}

export interface ReadingProgressDto {
  userId: string;
  bookId: string;
  chapterId: string;
  revisionId?: string | null;
  anchorId?: string | null;
  lastSeenAt: Date;
}

export class ProgressConflictError extends Error {
  readonly status = 409;
  readonly statusCode = 409;
  readonly code: string;
  readonly current: { completed: boolean; version: number };

  constructor(
    codeOrMessage = "PROGRESS_CONFLICT",
    statusOrCurrent: number | { completed: boolean; version: number } = 409,
    currentPayload?: { completed: boolean; version: number }
  ) {
    const message =
      typeof codeOrMessage === "string" && codeOrMessage !== "PROGRESS_CONFLICT"
        ? codeOrMessage
        : "Progres berubah di perangkat lain";
    super(message);
    this.name = "ProgressConflictError";
    this.code =
      typeof codeOrMessage === "string" && /^[A-Z0-9_]+$/.test(codeOrMessage)
        ? codeOrMessage
        : "PROGRESS_CONFLICT";
    if (typeof statusOrCurrent === "object" && statusOrCurrent !== null) {
      this.current = statusOrCurrent;
    } else if (currentPayload) {
      this.current = currentPayload;
    } else {
      this.current = { completed: false, version: 0 };
    }
    Object.setPrototypeOf(this, ProgressConflictError.prototype);
  }
}

export class GoneError extends Error {
  readonly status = 410;
  readonly statusCode = 410;
  readonly code: string;

  constructor(
    messageOrCode = "Item is retired",
    codeOrStatus: string | number = "ITEM_RETIRED"
  ) {
    let resolvedMessage: string;
    let resolvedCode: string;

    const secondArg = typeof codeOrStatus === "number" ? "ITEM_RETIRED" : codeOrStatus;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && secondArg !== "ITEM_RETIRED") {
      resolvedCode = messageOrCode;
      resolvedMessage = secondArg;
    } else if (/^[A-Z0-9_]+$/.test(secondArg)) {
      resolvedMessage = messageOrCode;
      resolvedCode = secondArg;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "ITEM_RETIRED";
    }

    super(resolvedMessage);
    this.name = "GoneError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, GoneError.prototype);
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  readonly code: string;

  constructor(
    messageOrCode = "Item not found",
    codeOrStatus: string | number = "NOT_FOUND"
  ) {
    let resolvedMessage: string;
    let resolvedCode: string;

    const secondArg = typeof codeOrStatus === "number" ? "NOT_FOUND" : codeOrStatus;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && secondArg !== "NOT_FOUND") {
      resolvedCode = messageOrCode;
      resolvedMessage = secondArg;
    } else if (/^[A-Z0-9_]+$/.test(secondArg)) {
      resolvedMessage = messageOrCode;
      resolvedCode = secondArg;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "NOT_FOUND";
    }

    super(resolvedMessage);
    this.name = "NotFoundError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
