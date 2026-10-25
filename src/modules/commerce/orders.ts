import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { orders, orderItems, checkoutRequests } from "@/shared/db/schema/commerce";
import type { DbOrTx } from "@/shared/jobs/types";
import type { Actor } from "@/modules/identity/types";
import {
  type OrderStatusDto,
  type CheckoutOrderStatus,
  OrderNotFoundError,
  ForbiddenError,
  ValidationError,
} from "./types";

export async function getOrderStatus(
  orderId: string,
  actor?: Actor | null,
  guestSessionId?: string,
  dbOrTx: DbOrTx = defaultDb
): Promise<OrderStatusDto> {
  if (!orderId || !orderId.trim()) {
    throw new ValidationError("orderId is required");
  }

  const orderRows = await dbOrTx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId.trim()));

  if (!orderRows || orderRows.length === 0) {
    throw new OrderNotFoundError(`Order not found: ${orderId}`);
  }

  const order = orderRows[0];

  // Authorization check:
  // 1. Authenticated buyer matching buyerUserId
  const isBuyerUser = Boolean(actor?.userId && order.buyerUserId && actor.userId === order.buyerUserId);
  // 2. Admin role
  const isAdmin = Boolean(actor?.roles && actor.roles.includes("admin"));
  // 3. Authenticated actor with verified email matching buyerEmail
  const isVerifiedBuyerEmail = Boolean(
    actor?.verifiedEmail && order.buyerEmail && actor.verifiedEmail.toLowerCase() === order.buyerEmail.toLowerCase()
  );

  let isGuestSessionMatched = false;
  if (!isBuyerUser && !isAdmin && !isVerifiedBuyerEmail && guestSessionId) {
    const guestScopeHash = createHash("sha256").update(guestSessionId).digest("hex");
    const matchedRequests = await dbOrTx
      .select()
      .from(checkoutRequests)
      .where(
        and(
          eq(checkoutRequests.orderId, order.id),
          eq(checkoutRequests.actorScopeHash, guestScopeHash)
        )
      );

    if (matchedRequests.length > 0) {
      isGuestSessionMatched = true;
    }
  }

  if (!isBuyerUser && !isAdmin && !isVerifiedBuyerEmail && !isGuestSessionMatched) {
    throw new ForbiddenError("You are not authorized to view this order");
  }

  const itemRows = await dbOrTx
    .select({
      bookId: orderItems.bookId,
      bookTitle: orderItems.bookTitleSnapshot,
      price: orderItems.price,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return {
    orderId: order.id,
    status: order.status as CheckoutOrderStatus,
    currency: "IDR",
    payable: order.payable,
    buyerEmail: order.buyerEmail,
    buyerName: order.buyerName,
    invoiceId: order.invoiceId,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    items: itemRows,
  };
}
