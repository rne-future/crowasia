import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { orders, orderItems, checkoutRequests } from "@/shared/db/schema/commerce";
import type { DbOrTx } from "@/shared/jobs/types";
import { env } from "@/shared/config/env";
import type { Actor } from "@/modules/identity/types";
import { getMayarClient, type MayarClient } from "@/modules/payments";
import { getOfferQuote, verifyQuoteToken } from "./quotes";
import {
  type CheckoutInput,
  type CheckoutResult,
  type CheckoutOrderStatus,
  type OfferQuote,
  ConflictError,
  QuoteExpiredError,
  ValidationError,
  OrderNotFoundError,
} from "./types";

async function runWithTransaction<T>(
  client: DbOrTx,
  operation: (tx: DbOrTx) => Promise<T>
): Promise<T> {
  if ("transaction" in client && typeof client.transaction === "function") {
    return await client.transaction(operation);
  }
  return await operation(client);
}

function calculateActorScopeHash(
  actor?: Actor | null,
  guestSessionId?: string,
  email?: string
): string {
  const scope = actor?.userId ?? guestSessionId ?? email?.trim().toLowerCase() ?? "anonymous";
  return createHash("sha256").update(scope).digest("hex");
}

function calculateRequestHash(input: CheckoutInput): string {
  const normalized = {
    offerId: input.offerId.trim(),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    mobile: input.mobile.trim(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function createCheckoutOrder(
  input: CheckoutInput,
  idempotencyKey: string,
  actor?: Actor | null,
  guestSessionId?: string,
  dbOrTx: DbOrTx = defaultDb,
  mayarClient: MayarClient = getMayarClient()
): Promise<CheckoutResult> {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw new ValidationError("Idempotency key is required");
  }
  if (!input.offerId || !input.offerId.trim()) {
    throw new ValidationError("offerId is required");
  }
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new ValidationError("Valid email is required");
  }
  if (!input.name || !input.name.trim()) {
    throw new ValidationError("Name is required");
  }
  if (!input.mobile || !input.mobile.trim()) {
    throw new ValidationError("Mobile number is required");
  }

  const actorScopeHash = calculateActorScopeHash(actor, guestSessionId, input.email);
  const requestHash = calculateRequestHash(input);

  // 1. Idempotency check via checkout_requests table
  const existingRequests = await dbOrTx
    .select()
    .from(checkoutRequests)
    .where(
      and(
        eq(checkoutRequests.actorScopeHash, actorScopeHash),
        eq(checkoutRequests.idempotencyKey, idempotencyKey)
      )
    );

  if (existingRequests.length > 0) {
    const existing = existingRequests[0];
    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
        "Idempotency key reused with different request payload"
      );
    }

    const orderRows = await dbOrTx
      .select()
      .from(orders)
      .where(eq(orders.id, existing.orderId));

    if (orderRows.length === 0) {
      throw new OrderNotFoundError(`Existing order not found for idempotency key`);
    }

    const existingOrder = orderRows[0];
    let paymentUrl: string | undefined;

    if (existingOrder.invoiceId) {
      try {
        const inv = await mayarClient.getInvoice(existingOrder.invoiceId);
        paymentUrl = inv.paymentUrl || inv.link;
      } catch {
        // Fallback silently if Mayar query fails during idempotent replay
      }
    }

    return {
      orderId: existingOrder.id,
      status: existingOrder.status as CheckoutOrderStatus,
      paymentUrl,
      invoiceId: existingOrder.invoiceId ?? undefined,
      idempotentReplay: true,
    };
  }

  // 2. Validate quote expiry
  let quote: OfferQuote;
  if (input.quoteToken) {
    verifyQuoteToken(input.quoteToken);
    quote = input.quote ?? (await getOfferQuote(input.offerId, dbOrTx));
  } else if (input.quote) {
    if (new Date(input.quote.expiresAt).getTime() <= Date.now()) {
      throw new QuoteExpiredError("Quote has expired");
    }
    quote = input.quote;
  } else {
    quote = await getOfferQuote(input.offerId, dbOrTx);
  }

  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    throw new QuoteExpiredError("Quote has expired");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();
  const normalizedMobile = input.mobile.trim();
  const providerEnv = env.APP_ENV === "production" ? "production" : "sandbox";

  // 3. Transactional reservation
  const createdOrder = await runWithTransaction(dbOrTx, async (tx) => {
    const [newOrder] = await tx
      .insert(orders)
      .values({
        buyerUserId: actor?.userId ?? null,
        buyerEmail: normalizedEmail,
        buyerName: normalizedName,
        buyerMobile: normalizedMobile,
        status: "INVOICE_CREATING",
        currency: "IDR",
        subtotal: quote.subtotal,
        discount: quote.discount,
        tax: quote.tax,
        payable: quote.payable,
        termsVersion: quote.termsVersion || "2026-10-25",
        providerEnv,
        merchantId: "default",
      })
      .returning();

    const bookCount = BigInt(quote.books.length > 0 ? quote.books.length : 1);
    const itemPrice = quote.payable / bookCount;
    const remainder = quote.payable - itemPrice * bookCount;

    for (let i = 0; i < quote.books.length; i++) {
      const book = quote.books[i];
      const price = i === 0 ? itemPrice + remainder : itemPrice;
      await tx.insert(orderItems).values({
        orderId: newOrder.id,
        bookId: book.id,
        bookTitleSnapshot: book.title,
        offerIdSnapshot: quote.offerId,
        price,
      });
    }

    await tx.insert(checkoutRequests).values({
      actorScopeHash,
      idempotencyKey,
      requestHash,
      orderId: newOrder.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return newOrder;
  });

  // 4. Call Mayar createInvoice outside of DB transaction
  try {
    const invoice = await mayarClient.createInvoice({
      name: normalizedName,
      email: normalizedEmail,
      mobile: normalizedMobile,
      amount: createdOrder.payable,
      description: `Order ${createdOrder.id} - ${quote.tierCode}`,
      orderId: createdOrder.id,
    });

    await dbOrTx
      .update(orders)
      .set({
        invoiceId: invoice.id,
        merchantId: invoice.userId ?? "default",
        status: "AWAITING_PAYMENT",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, createdOrder.id));

    return {
      orderId: createdOrder.id,
      status: "AWAITING_PAYMENT",
      paymentUrl: invoice.paymentUrl || invoice.link,
      invoiceId: invoice.id,
    };
  } catch {
    // If Mayar throws timeout / network / 5xx error:
    // Update order with status: 'CREATE_UNKNOWN' (no blind recreation)
    await dbOrTx
      .update(orders)
      .set({
        status: "CREATE_UNKNOWN",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, createdOrder.id));

    return {
      orderId: createdOrder.id,
      status: "CREATE_UNKNOWN",
    };
  }
}
