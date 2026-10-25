import { NextResponse } from "next/server";
import { handleMayarWebhook } from "@/modules/payments/webhook";

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB (65,536 bytes)

export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  // 1. Check Content-Length header if present
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "Payload Too Large" },
      { status: 413 }
    );
  }

  // 2. Read and verify raw body size
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    );
  }

  const byteLength = new TextEncoder().encode(rawBody).length;
  if (byteLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "Payload Too Large" },
      { status: 413 }
    );
  }

  // 3. Parse JSON safely
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // 4. Ingest webhook event as untrusted hint into durable inbox
  try {
    const result = await handleMayarWebhook(payload, request.headers);

    // Structured logging: only operation telemetry, zero PII
    console.log(
      JSON.stringify({
        event: "mayar_webhook_ingested",
        inboxId: result.inboxId,
        durationMs: Date.now() - startTime,
      })
    );

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      JSON.stringify({
        event: "mayar_webhook_error",
        error: message,
      })
    );

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
