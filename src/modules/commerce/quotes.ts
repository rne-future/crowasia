import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and, or } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { pricingTiers, tierBooks, books } from "@/shared/db/schema/catalog";
import type { DbOrTx } from "@/shared/jobs/types";
import { env } from "@/shared/config/env";
import {
  type OfferQuote,
  type QuoteTokenPayload,
  OfferNotFoundError,
  QuoteExpiredError,
  InvalidQuoteError,
  ValidationError,
} from "./types";

function getQuoteSecret(): string {
  const secret = env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    if (env.APP_ENV === "production") {
      throw new Error("Missing quote secret in production environment");
    }
    return "crowasia-quote-secret-salt-2026";
  }
  return secret;
}

export function createQuoteToken(
  payload: QuoteTokenPayload,
  secret = getQuoteSecret()
): string {
  const jsonStr = JSON.stringify(payload);
  const data = Buffer.from(jsonStr, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyQuoteToken(
  token: string,
  secret = getQuoteSecret()
): QuoteTokenPayload {
  if (!token || typeof token !== "string") {
    throw new InvalidQuoteError("Quote token missing or invalid");
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new InvalidQuoteError("Malformed quote token");
  }
  const [data, signature] = parts;
  const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");

  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new InvalidQuoteError("Invalid quote token signature");
  }

  let payload: QuoteTokenPayload;
  try {
    const jsonStr = Buffer.from(data, "base64url").toString("utf8");
    payload = JSON.parse(jsonStr);
  } catch {
    throw new InvalidQuoteError("Failed to parse quote token payload");
  }

  const expiresAt = new Date(payload.expiresAt);
  if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new QuoteExpiredError("Quote token has expired");
  }

  return payload;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOfferQuote(
  offerId: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<OfferQuote> {
  if (!offerId || !offerId.trim()) {
    throw new ValidationError("offerId is required");
  }

  const trimmedOffer = offerId.trim();
  const isUuid = UUID_REGEX.test(trimmedOffer);

  const tierRows = await dbOrTx
    .select()
    .from(pricingTiers)
    .where(
      and(
        eq(pricingTiers.status, "active"),
        isUuid
          ? or(eq(pricingTiers.id, trimmedOffer), eq(pricingTiers.code, trimmedOffer))
          : eq(pricingTiers.code, trimmedOffer)
      )
    );

  if (!tierRows || tierRows.length === 0) {
    throw new OfferNotFoundError(`Active pricing tier not found for offer: ${offerId}`);
  }

  const tier = tierRows[0];

  const bookRows = await dbOrTx
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
    })
    .from(tierBooks)
    .innerJoin(books, eq(tierBooks.bookId, books.id))
    .where(eq(tierBooks.tierId, tier.id));

  const subtotal = tier.amountIdr;
  const discount = 0n;
  const tax = 0n;
  const payable = subtotal - discount + tax;

  if (payable <= 0n) {
    throw new ValidationError("Payable must be greater than zero");
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

  const tokenPayload: QuoteTokenPayload = {
    tierId: tier.id,
    tierCode: tier.code,
    amountIdr: payable.toString(),
    expiresAt: expiresAt.toISOString(),
    termsVersion: tier.termsVersion,
  };

  const token = createQuoteToken(tokenPayload);

  return {
    offerId: tier.code,
    tierId: tier.id,
    tierCode: tier.code,
    currency: "IDR",
    subtotal,
    discount,
    tax,
    payable,
    termsVersion: tier.termsVersion,
    books: bookRows,
    createdAt,
    expiresAt,
    token,
  };
}
