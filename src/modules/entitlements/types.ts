import type { Actor } from "@/modules/identity/types";

export interface GrantProvenance {
  grantId: string;
  bookId: string;
  userId: string | null;
  source: "purchase" | "manual";
  orderItemId?: string;
  grantedAt: Date;
  revokedAt?: Date | null;
}

export interface CanReadChapterOptions {
  actor: Actor | null;
  bookId: string;
  chapterIndex: number;
}
