import { eq, or } from "drizzle-orm";
import { db as defaultDb } from "@/shared/db/client";
import { orders } from "@/shared/db/schema/commerce";
import { registerInboxHandler } from "@/shared/jobs/process-inbox";
import type { DbOrTx, WebhookInboxRow } from "@/shared/jobs/types";
import {
  type MayarClient,
  getMayarClient,
} from "./adapter";
import {
  type OrderSnapshot,
  PaymentVerificationError,
} from "./types";
import { settleVerifiedPayment } from "@/modules/commerce/settle";
import { OrderNotFoundError } from "@/modules/commerce/types";

/**
 * Worker inbox processor for Mayar webhook events.
 * Fetches the verified invoice & transaction state directly from the authoritative Mayar API,
 * validates against database order snapshot, and executes atomic settlement.
 */
export async function processMayarWebhookEvent(
  inboxEvent: WebhookInboxRow,
  dbOrTx: DbOrTx = defaultDb,
  clientOverride?: MayarClient
): Promise<void> {
  const payload = (inboxEvent.normalizedJson ?? {}) as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const extraData = (data.extraData && typeof data.extraData === "object"
    ? data.extraData
    : payload.extraData) as Record<string, unknown> | undefined;

  let invoiceId =
    (typeof data.id === "string" ? data.id : null) ??
    (typeof data.invoiceId === "string" ? data.invoiceId : null) ??
    (typeof payload.invoiceId === "string" ? payload.invoiceId : null) ??
    (typeof payload.id === "string" && !payload.id.startsWith("evt_") ? payload.id : null);

  const transactionId =
    (typeof data.transactionId === "string" ? data.transactionId : null) ??
    (typeof payload.transactionId === "string" ? payload.transactionId : null);

  const orderId =
    (typeof extraData?.orderId === "string" ? extraData.orderId : null) ??
    (typeof data.orderId === "string" ? data.orderId : null) ??
    (typeof payload.orderId === "string" ? payload.orderId : null);

  const client = clientOverride ?? getMayarClient();

  if (!invoiceId && transactionId) {
    try {
      const txn = await client.getTransaction(transactionId);
      if (txn.paymentLink?.id) {
        invoiceId = txn.paymentLink.id;
      }
    } catch {
      // Continue to order lookup
    }
  }

  if (!invoiceId && !orderId) {
    throw new PaymentVerificationError(
      "Could not extract invoiceId or orderId from webhook inbox event"
    );
  }

  // Look up order in database
  let orderWhere;
  if (orderId && invoiceId) {
    orderWhere = or(eq(orders.id, orderId), eq(orders.invoiceId, invoiceId));
  } else if (orderId) {
    orderWhere = eq(orders.id, orderId);
  } else {
    orderWhere = eq(orders.invoiceId, invoiceId!);
  }

  const orderQuery = dbOrTx.select().from(orders).where(orderWhere);
  const orderRows =
    typeof orderQuery.limit === "function"
      ? await orderQuery.limit(1)
      : await orderQuery;

  if (!orderRows || orderRows.length === 0) {
    throw new OrderNotFoundError(
      `Order not found for webhook invoice ${invoiceId ?? orderId}`
    );
  }

  const order = orderRows[0];

  const targetInvoiceId = invoiceId ?? order.invoiceId;
  if (!targetInvoiceId) {
    throw new PaymentVerificationError(
      "No invoice ID found to verify payment with Mayar"
    );
  }

  const orderSnapshot: OrderSnapshot = {
    orderId: order.id,
    payable: order.payable,
    currency: order.currency,
    buyerEmail: order.buyerEmail,
  };

  // Authoritative API verification with Mayar
  const verifiedPayment = await client.verifyPayment(orderSnapshot, targetInvoiceId);

  // Execute atomic settlement (idempotent if already settled)
  await settleVerifiedPayment(verifiedPayment, dbOrTx);
}

/**
 * Registers the Mayar webhook inbox processor for sandbox and production environments.
 */
export function registerMayarInboxHandler(): void {
  registerInboxHandler("mayar_sandbox", (event) => processMayarWebhookEvent(event));
  registerInboxHandler("mayar_production", (event) => processMayarWebhookEvent(event));
}

// Auto-register inbox handler for Mayar
registerMayarInboxHandler();
