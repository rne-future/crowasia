import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import {
  orders,
  orderItems,
  purchaseClaims,
  purchaseGrants,
} from "@/shared/db/schema/commerce";
import { enqueueOutboxJob } from "@/shared/jobs/outbox-worker";
import type { DbOrTx } from "@/shared/jobs/types";
import type { Actor } from "@/modules/identity/types";
import { OrderNotFoundError } from "@/modules/commerce/types";
import {
  ClaimForbiddenError,
  type ClaimPurchaseResult,
  type PurchaseClaimRequestResult,
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

/**
 * Initiates a guest purchase claim request.
 * 1. Verifies order exists and is in PAID status.
 * 2. Compares buyer email case-insensitively.
 * 3. Invalidates older active claim tokens for this order.
 * 4. Generates a strong random token and stores its SHA-256 hash in purchase_claims.
 * 5. Sets a 24-hour expiration.
 * 6. Enqueues a claim_email outbox job containing the raw token for email transmission.
 */
export async function requestPurchaseClaim(
  orderId: string,
  email: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<PurchaseClaimRequestResult> {
  if (!email || !email.trim()) {
    throw new ClaimForbiddenError("Email address is required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const orderRows = await dbOrTx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRows || orderRows.length === 0) {
    throw new OrderNotFoundError(`Order not found: ${orderId}`);
  }

  const order = orderRows[0];

  if (order.status !== "PAID" && order.status !== "paid") {
    throw new ClaimForbiddenError("Order is not paid");
  }

  if (order.buyerEmail.trim().toLowerCase() !== normalizedEmail) {
    throw new ClaimForbiddenError("Email does not match order buyer email");
  }

  const sixtySecondsAgo = new Date(Date.now() - 60_000);
  const recentClaims = await dbOrTx
    .select()
    .from(purchaseClaims)
    .where(
      and(
        eq(purchaseClaims.orderId, order.id),
        gt(purchaseClaims.createdAt, sixtySecondsAgo),
        isNull(purchaseClaims.usedAt)
      )
    )
    .limit(1);

  if (recentClaims && recentClaims.length > 0) {
    const recentClaim = recentClaims[0];
    return {
      claimId: recentClaim.id,
      expiresAt: recentClaim.expiresAt,
    };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const claimId = randomUUID();

  return await runWithTransaction(dbOrTx, async (tx) => {
    const now = new Date();

    // Invalidate any existing active unconsumed claims for this order
    await tx
      .update(purchaseClaims)
      .set({ expiresAt: now })
      .where(
        and(
          eq(purchaseClaims.orderId, order.id),
          isNull(purchaseClaims.usedAt)
        )
      );

    await tx
      .insert(purchaseClaims)
      .values({
        id: claimId,
        orderId: order.id,
        tokenHash,
        expiresAt,
      });

    await enqueueOutboxJob(tx, {
      kind: "claim_email",
      aggregateId: order.id,
      dedupeKey: `claim-email-${claimId}`,
      payload: {
        orderId: order.id,
        email: normalizedEmail,
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      claimId,
      expiresAt,
    };
  });
}

/**
 * Claims a guest purchase for an authenticated actor with a matching verified email.
 * 1. Computes SHA-256 hash of incoming raw token and looks up purchase_claims.
 * 2. Verifies claim exists, is unused, and is not expired.
 * 3. Verifies parent order exists and status is PAID.
 * 4. Strictly checks actor.verifiedEmail matches order.buyerEmail.
 * 5. Atomically binds order and grants to actor.userId, sets claim usedAt, and enqueues purchase_claimed event.
 */
export async function claimPurchase(
  token: string,
  actor: Actor,
  dbOrTx: DbOrTx = defaultDb
): Promise<ClaimPurchaseResult> {
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new ClaimForbiddenError("Claim token is required");
  }

  if (!actor || !actor.userId) {
    throw new ClaimForbiddenError("Authenticated actor required for claim");
  }

  if (!actor.verifiedEmail || !actor.verifiedEmail.trim()) {
    throw new ClaimForbiddenError("Authenticated verified email required");
  }

  const tokenHash = createHash("sha256").update(token.trim()).digest("hex");

  const claimRows = await dbOrTx
    .select()
    .from(purchaseClaims)
    .where(eq(purchaseClaims.tokenHash, tokenHash))
    .limit(1);

  if (!claimRows || claimRows.length === 0) {
    throw new ClaimForbiddenError("Invalid claim token");
  }

  const claim = claimRows[0];

  if (claim.usedAt) {
    throw new ClaimForbiddenError("Claim token has already been used");
  }

  if (new Date(claim.expiresAt).getTime() <= Date.now()) {
    throw new ClaimForbiddenError("Claim token has expired");
  }

  const orderRows = await dbOrTx
    .select()
    .from(orders)
    .where(eq(orders.id, claim.orderId))
    .limit(1);

  if (!orderRows || orderRows.length === 0) {
    throw new ClaimForbiddenError("Parent order not found");
  }

  const order = orderRows[0];

  if (order.status !== "PAID" && order.status !== "paid") {
    throw new ClaimForbiddenError("Order is not paid");
  }

  const actorEmail = actor.verifiedEmail.trim().toLowerCase();
  const buyerEmail = order.buyerEmail.trim().toLowerCase();

  if (actorEmail !== buyerEmail) {
    throw new ClaimForbiddenError(
      "Authenticated verified email does not match order buyer email"
    );
  }

  if (order.buyerUserId && order.buyerUserId !== actor.userId) {
    throw new ClaimForbiddenError("Order has already been claimed by another user");
  }

  return await runWithTransaction(dbOrTx, async (tx) => {
    const claimTime = new Date();

    // 1. Mark claim as used with single-use CAS guard
    const updateQuery = tx
      .update(purchaseClaims)
      .set({
        usedAt: claimTime,
        claimedBy: actor.userId,
      })
      .where(
        and(
          eq(purchaseClaims.id, claim.id),
          isNull(purchaseClaims.usedAt)
        )
      );

    const updatedClaims =
      typeof (updateQuery as unknown as { returning?: (fields: unknown) => Promise<unknown[]> }).returning ===
      "function"
        ? await (updateQuery as unknown as { returning: (fields: unknown) => Promise<unknown[]> }).returning({
            id: purchaseClaims.id,
          })
        : await (updateQuery as unknown as Promise<unknown>);

    if (
      (Array.isArray(updatedClaims) && updatedClaims.length === 0) ||
      (typeof updatedClaims === "object" &&
        updatedClaims !== null &&
        "rowCount" in updatedClaims &&
        (updatedClaims as { rowCount?: number }).rowCount === 0)
    ) {
      throw new ClaimForbiddenError("Claim token has already been used");
    }

    // 2. Bind order to actor
    await tx
      .update(orders)
      .set({
        buyerUserId: actor.userId,
        updatedAt: claimTime,
      })
      .where(eq(orders.id, order.id));

    // 3. Find order items to update purchase_grants
    const items = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const orderItemIds = (items ?? []).map((i) => i.id);
    let grantsCount = 0;

    if (orderItemIds.length > 0) {
      await tx
        .update(purchaseGrants)
        .set({ userId: actor.userId })
        .where(
          and(
            inArray(purchaseGrants.orderItemId, orderItemIds),
            isNull(purchaseGrants.userId)
          )
        );
      grantsCount = orderItemIds.length;
    }

    // 4. Enqueue purchase_claimed event
    await enqueueOutboxJob(tx, {
      kind: "purchase_claimed",
      aggregateId: order.id,
      dedupeKey: `purchase-claimed-${order.id}-${actor.userId}`,
      payload: {
        orderId: order.id,
        userId: actor.userId,
      },
    });

    return {
      claimed: true,
      orderId: order.id,
      grantsCount,
    };
  });
}
