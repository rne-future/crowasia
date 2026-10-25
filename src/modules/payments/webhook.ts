import { createHash, randomUUID } from "node:crypto";
import { env } from "@/shared/config/env";
import { db as defaultDb } from "@/shared/db/client";
import { insertInboxEvent } from "@/shared/jobs/inbox-worker";
import type { DbOrTx } from "@/shared/jobs/types";

export interface HandleMayarWebhookResult {
  received: boolean;
  inboxId: string;
}

export function extractMayarEventKey(payload: Record<string, unknown>): string {
  // 1. Explicit id or event_id
  if (typeof payload.id === "string" && payload.id.trim() !== "") {
    return payload.id.trim();
  }
  if (typeof payload.event_id === "string" && payload.event_id.trim() !== "") {
    return payload.event_id.trim();
  }

  // 2. Event data id or transactionId
  const data = payload.data;
  if (data && typeof data === "object") {
    const dataObj = data as Record<string, unknown>;
    const eventPrefix =
      typeof payload.event === "string" && payload.event.trim() !== ""
        ? `${payload.event.trim()}_`
        : "";

    if (typeof dataObj.id === "string" && dataObj.id.trim() !== "") {
      return `${eventPrefix}${dataObj.id.trim()}`;
    }
    if (
      typeof dataObj.transactionId === "string" &&
      dataObj.transactionId.trim() !== ""
    ) {
      return `${eventPrefix}${dataObj.transactionId.trim()}`;
    }
  }

  // 3. Fallback: deterministic hash of payload
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return `evt_${hash.slice(0, 32)}`;
}

/**
 * Handles incoming Mayar webhook callback as an untrusted hint.
 * Persists the raw event safely into the webhook_inbox table for asynchronous processing.
 * Never settles inline or mutates order/grant state directly in the webhook handler.
 */
export async function handleMayarWebhook(
  payload: unknown,
  _headers?: Headers,
  dbOrTx: DbOrTx = defaultDb
): Promise<HandleMayarWebhookResult> {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Mayar webhook payload: expected non-null object");
  }

  const payloadObj = payload as Record<string, unknown>;
  const eventKey = extractMayarEventKey(payloadObj);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payloadObj))
    .digest("hex");

  const providerEnv =
    env.APP_ENV === "production" ? "mayar_production" : "mayar_sandbox";

  const inboxId = randomUUID();

  await insertInboxEvent(dbOrTx, {
    id: inboxId,
    providerEnv,
    eventKey,
    payloadHash,
    normalizedJson: payloadObj,
  });

  return {
    received: true,
    inboxId,
  };
}
