import { and, eq, or } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { orders, orderItems, verifiedPayments, purchaseGrants } from "@/shared/db/schema/commerce";
import { enqueueOutboxJob } from "@/shared/jobs/outbox-worker";
import type { DbOrTx } from "@/shared/jobs/types";
import {
  type VerifiedPaymentData,
  AmountMismatchError,
  PaymentVerificationError,
} from "@/modules/payments/types";
import { OrderNotFoundError, type SettlementResult } from "./types";

/**
 * Executes atomic payment settlement for a verified Mayar payment.
 *
 * Sequence:
 * 1. Opens DB transaction.
 * 2. Locks order row FOR UPDATE.
 * 3. Idempotency check: if order is already PAID with same transactionId, returns alreadySettled.
 * 4. Validates order status (AWAITING_PAYMENT, CREATE_UNKNOWN, pending, or EXPIRED for late payments).
 * 5. Verifies exact amount matches order.payable.
 * 6. Inserts verified_payments audit row.
 * 7. Inserts purchase_grants for each order_item in snapshot.
 * 8. Updates orders row (status = 'PAID', paid_at = now(), transaction_id = txnId).
 * 9. Enqueues outbox event ('order_settled').
 * 10. Commits transaction.
 */
export async function settleVerifiedPayment(
  verifiedPayment: VerifiedPaymentData,
  dbOrTx: DbOrTx = defaultDb
): Promise<SettlementResult> {
  const runInTransaction = async (tx: DbOrTx): Promise<SettlementResult> => {
    // 1. Lock order row FOR UPDATE
    let orderWhereCondition;
    if (verifiedPayment.orderId && verifiedPayment.invoiceId) {
      orderWhereCondition = or(
        eq(orders.id, verifiedPayment.orderId),
        eq(orders.invoiceId, verifiedPayment.invoiceId)
      );
    } else if (verifiedPayment.orderId) {
      orderWhereCondition = eq(orders.id, verifiedPayment.orderId);
    } else {
      orderWhereCondition = eq(orders.invoiceId, verifiedPayment.invoiceId);
    }

    const orderQuery = tx.select().from(orders).where(orderWhereCondition);
    const orderRows =
      typeof orderQuery.for === "function"
        ? await orderQuery.for("update")
        : await orderQuery;

    if (!orderRows || orderRows.length === 0) {
      throw new OrderNotFoundError(
        `Order not found for settlement: ${verifiedPayment.orderId ?? verifiedPayment.invoiceId}`
      );
    }

    const order = orderRows[0];

    // 2. Check if already paid
    const isPaid = order.status === "PAID" || order.status === "paid";
    if (isPaid) {
      if (order.transactionId === verifiedPayment.transactionId) {
        return {
          settled: true,
          alreadySettled: true,
          orderId: order.id,
        };
      }

      // Check verified_payments table for this transaction on this order
      const vpQuery = tx
        .select()
        .from(verifiedPayments)
        .where(
          and(
            eq(verifiedPayments.orderId, order.id),
            eq(verifiedPayments.transactionId, verifiedPayment.transactionId)
          )
        );
      const vpRows =
        typeof vpQuery.limit === "function"
          ? await vpQuery.limit(1)
          : await vpQuery;

      if (vpRows && vpRows.length > 0) {
        return {
          settled: true,
          alreadySettled: true,
          orderId: order.id,
        };
      }

      throw new PaymentVerificationError("Order already paid by different transaction");
    }

    // 3. Validate order status
    const allowableStatuses = [
      "AWAITING_PAYMENT",
      "CREATE_UNKNOWN",
      "pending",
      "EXPIRED",
      "expired",
    ];

    if (!allowableStatuses.includes(order.status)) {
      throw new PaymentVerificationError(
        `Cannot settle order with status '${order.status}'`
      );
    }

    // 4. Verify exact amount
    if (verifiedPayment.amount !== order.payable) {
      throw new AmountMismatchError(order.payable, verifiedPayment.amount);
    }

    // 5. Check if transactionId has already been recorded in verified_payments
    const existingVpQuery = tx
      .select()
      .from(verifiedPayments)
      .where(
        and(
          eq(verifiedPayments.providerEnv, verifiedPayment.environment),
          eq(verifiedPayments.merchantId, verifiedPayment.merchantId),
          eq(verifiedPayments.transactionId, verifiedPayment.transactionId)
        )
      );

    const existingVpRows =
      typeof existingVpQuery.limit === "function"
        ? await existingVpQuery.limit(1)
        : await existingVpQuery;

    if (existingVpRows && existingVpRows.length > 0) {
      if (existingVpRows[0].orderId === order.id) {
        return {
          settled: true,
          alreadySettled: true,
          orderId: order.id,
        };
      }
      throw new PaymentVerificationError(
        "Transaction already associated with a different order"
      );
    }

    // 6. Insert verified_payments record
    await tx.insert(verifiedPayments).values({
      orderId: order.id,
      providerEnv: verifiedPayment.environment,
      merchantId: verifiedPayment.merchantId,
      transactionId: verifiedPayment.transactionId,
      invoiceId: verifiedPayment.invoiceId,
      amount: verifiedPayment.amount,
      evidenceHash: verifiedPayment.evidenceHash,
      verifiedAt: verifiedPayment.verifiedAt,
    });

    // 7. Query order items snapshot
    const itemQuery = tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const items = await itemQuery;

    // 8. Insert purchase_grants for each item
    const grantedAt = new Date();
    for (const item of items ?? []) {
      const grantInsert = tx.insert(purchaseGrants).values({
        orderItemId: item.id,
        bookId: item.bookId,
        userId: order.buyerUserId ?? null,
        grantedAt,
      });

      if (typeof grantInsert.onConflictDoNothing === "function") {
        await grantInsert.onConflictDoNothing();
      } else {
        await grantInsert;
      }
    }

    // 9. Update orders row
    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: "PAID",
        paidAt: now,
        transactionId: verifiedPayment.transactionId,
        invoiceId: order.invoiceId ?? verifiedPayment.invoiceId,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    // 10. Enqueue outbox job
    await enqueueOutboxJob(tx, {
      kind: "order_settled",
      aggregateId: order.id,
      dedupeKey: `order-settled-${order.id}`,
      payload: {
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        buyerUserId: order.buyerUserId,
        books: (items ?? []).map((i) => i.bookId),
      },
    });

    return {
      settled: true,
      orderId: order.id,
      grantsCount: (items ?? []).length,
    };
  };

  if (typeof dbOrTx.transaction === "function") {
    return (dbOrTx.transaction as unknown as (cb: (tx: DbOrTx) => Promise<SettlementResult>) => Promise<SettlementResult>)(runInTransaction);
  }

  return runInTransaction(dbOrTx);
}
