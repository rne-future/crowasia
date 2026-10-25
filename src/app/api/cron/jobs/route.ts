import { NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { runInboxWorker } from "@/shared/jobs/process-inbox";
import { runOutboxWorker } from "@/shared/jobs/process-outbox";
import { registerMayarInboxHandler } from "@/modules/payments/inbox-handler";
import { reconcileOpenOrders } from "@/modules/payments/reconcile";

async function handleCronRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    registerMayarInboxHandler();
    const inboxResult = await runInboxWorker();
    const outboxResult = await runOutboxWorker();
    const reconcileResult = await reconcileOpenOrders();
    const durationMs = Date.now() - startTime;

    // Structured logging: only job counts and latency metrics, strictly zero PII
    console.log(
      JSON.stringify({
        event: "cron_jobs_processed",
        durationMs,
        inbox: {
          claimed: inboxResult.claimed,
          processed: inboxResult.processed,
          retried: inboxResult.retried,
          dead: inboxResult.dead,
          oldestPendingAgeMs: inboxResult.oldestPendingAgeMs,
        },
        outbox: {
          claimed: outboxResult.claimed,
          processed: outboxResult.processed,
          retried: outboxResult.retried,
          dead: outboxResult.dead,
          oldestPendingAgeMs: outboxResult.oldestPendingAgeMs,
        },
        reconcile: {
          scanned: reconcileResult.scannedCount,
          settled: reconcileResult.settledCount,
          expired: reconcileResult.expiredCount,
          errors: reconcileResult.errors.length,
        },
      })
    );

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        durationMs,
        inbox: inboxResult,
        outbox: outboxResult,
        reconcile: reconcileResult,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        event: "cron_jobs_error",
        error: message,
      })
    );

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleCronRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCronRequest(request);
}
