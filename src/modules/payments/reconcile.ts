import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { orders } from "@/shared/db/schema/commerce";
import type { DbOrTx } from "@/shared/jobs/types";
import {
  type MayarClient,
  getMayarClient,
} from "./adapter";
import {
  type OrderSnapshot,
  type VerifiedPaymentData,
} from "./types";
import { settleVerifiedPayment } from "@/modules/commerce/settle";
import type { SettlementResult } from "@/modules/commerce/types";

export interface ReconciliationReport {
  scannedCount: number;
  settledCount: number;
  expiredCount: number;
  errors: string[];
}

export interface ReconcileOptions {
  maxBatchSize?: number;
  dbOrTx?: DbOrTx;
  client?: MayarClient;
  minAgeMinutes?: number;
  settler?: (
    verifiedPayment: VerifiedPaymentData,
    dbOrTx?: DbOrTx
  ) => Promise<SettlementResult>;
}

/**
 * Reconciles open and pending orders against authoritative Mayar gateway invoices.
 * 1. Scans orders in AWAITING_PAYMENT, CREATE_UNKNOWN, or pending status with an invoiceId.
 * 2. Filters orders created at least minAgeMinutes ago (default: 15m) up to maxBatchSize.
 * 3. Inspects authoritative Mayar invoice status:
 *    - If paid: verifies invoice and executes atomic payment settlement.
 *    - If expired or closed: marks order as EXPIRED.
 * 4. Resiliently collects errors without halting the reconciliation batch.
 */
export async function reconcileOpenOrders(
  options?: ReconcileOptions
): Promise<ReconciliationReport>;
export async function reconcileOpenOrders(
  maxBatchSize?: number,
  dbOrTx?: DbOrTx,
  clientOverride?: MayarClient,
  minAgeMinutes?: number
): Promise<ReconciliationReport>;
export async function reconcileOpenOrders(
  optsOrBatchSize?: ReconcileOptions | number,
  maybeDb?: DbOrTx,
  maybeClient?: MayarClient,
  maybeMinAge?: number
): Promise<ReconciliationReport> {
  let maxBatchSize = 50;
  let dbOrTx: DbOrTx = defaultDb;
  let clientOverride: MayarClient | undefined;
  let minAgeMinutes = 15;
  let settler = settleVerifiedPayment;

  if (typeof optsOrBatchSize === "object" && optsOrBatchSize !== null) {
    if (optsOrBatchSize.maxBatchSize !== undefined) maxBatchSize = optsOrBatchSize.maxBatchSize;
    if (optsOrBatchSize.dbOrTx !== undefined) dbOrTx = optsOrBatchSize.dbOrTx;
    if (optsOrBatchSize.client !== undefined) clientOverride = optsOrBatchSize.client;
    if (optsOrBatchSize.minAgeMinutes !== undefined) minAgeMinutes = optsOrBatchSize.minAgeMinutes;
    if (optsOrBatchSize.settler !== undefined) settler = optsOrBatchSize.settler;
  } else if (typeof optsOrBatchSize === "number") {
    maxBatchSize = optsOrBatchSize;
    if (maybeDb !== undefined) dbOrTx = maybeDb;
    if (maybeClient !== undefined) clientOverride = maybeClient;
    if (maybeMinAge !== undefined) minAgeMinutes = maybeMinAge;
  } else if (maybeDb !== undefined) {
    dbOrTx = maybeDb;
  }

  const client = clientOverride ?? getMayarClient();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - minAgeMinutes * 60 * 1000);

  const whereConditions = [
    or(
      and(
        isNotNull(orders.invoiceId),
        inArray(orders.status, ["AWAITING_PAYMENT", "CREATE_UNKNOWN", "pending"])
      ),
      and(
        isNull(orders.invoiceId),
        inArray(orders.status, ["CREATE_UNKNOWN", "INVOICE_CREATING"])
      )
    ),
  ];

  if (minAgeMinutes > 0) {
    whereConditions.push(lte(orders.createdAt, cutoffDate));
  }

  const query = dbOrTx
    .select()
    .from(orders)
    .where(and(...whereConditions));

  interface ChainableQuery {
    orderBy?: (orderClause: unknown) => ChainableQuery;
    limit?: (n: number) => Promise<unknown>;
  }

  const queryCandidate = query as unknown as ChainableQuery;
  const orderedQuery =
    typeof queryCandidate.orderBy === "function"
      ? queryCandidate.orderBy(asc(orders.createdAt))
      : queryCandidate;

  const limitedQuery =
    typeof orderedQuery.limit === "function"
      ? await orderedQuery.limit(maxBatchSize)
      : await (orderedQuery as unknown as Promise<unknown>);

  const candidateOrders = Array.isArray(limitedQuery)
    ? (limitedQuery as (typeof orders.$inferSelect)[])
    : [];

  let scannedCount = 0;
  let settledCount = 0;
  let expiredCount = 0;
  const errors: string[] = [];

  for (const order of candidateOrders) {
    scannedCount++;

    if (!order.invoiceId) {
      try {
        await dbOrTx
          .update(orders)
          .set({ status: "EXPIRED", updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        expiredCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(
          `Order ${order.id} (null invoice) expiration failed: ${message}`
        );
      }
      continue;
    }

    try {
      const invoice = await client.getInvoice(order.invoiceId);
      const invoiceStatus = (invoice.status ?? "").toLowerCase();

      if (invoiceStatus === "paid") {
        const orderSnapshot: OrderSnapshot = {
          orderId: order.id,
          payable: order.payable,
          currency: order.currency,
          buyerEmail: order.buyerEmail,
        };

        const verifiedPayment = await client.verifyPayment(
          orderSnapshot,
          order.invoiceId
        );
        await settler(verifiedPayment, dbOrTx);
        settledCount++;
      } else if (invoiceStatus === "expired" || invoiceStatus === "closed") {
        if (order.status !== "EXPIRED" && order.status !== "expired") {
          await dbOrTx
            .update(orders)
            .set({
              status: "EXPIRED",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));
          expiredCount++;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(
        `Order ${order.id} (invoice ${order.invoiceId}) reconciliation failed: ${message}`
      );
    }
  }

  return {
    scannedCount,
    settledCount,
    expiredCount,
    errors,
  };
}
