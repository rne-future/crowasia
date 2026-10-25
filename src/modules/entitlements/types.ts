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

export class ClaimForbiddenError extends Error {
  readonly status = 403;
  readonly statusCode = 403;
  readonly code = "CLAIM_FORBIDDEN";

  constructor(message = "Claim forbidden") {
    super(message);
    this.name = "ClaimForbiddenError";
    Object.setPrototypeOf(this, ClaimForbiddenError.prototype);
  }
}

export interface PurchaseClaimRequestResult {
  claimId: string;
  expiresAt: Date;
}

export interface ClaimPurchaseResult {
  claimed: boolean;
  orderId: string;
  grantsCount: number;
}

