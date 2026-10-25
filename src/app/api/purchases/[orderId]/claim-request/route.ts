import { NextResponse } from "next/server";
import {
  requestPurchaseClaim,
  ClaimForbiddenError,
} from "@/modules/entitlements";
import { OrderNotFoundError } from "@/modules/commerce";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> | { orderId: string } }
): Promise<Response> {
  try {
    const resolvedParams = await Promise.resolve(params);
    const orderId = resolvedParams.orderId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    try {
      await requestPurchaseClaim(orderId, email);
    } catch (error: unknown) {
      // Timing-safe & anti-enumeration: do not leak whether order exists or email matches
      if (
        error instanceof OrderNotFoundError ||
        error instanceof ClaimForbiddenError
      ) {
        return NextResponse.json(
          { requested: true },
          { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { requested: true },
      { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  } catch (error: unknown) {
    console.error("Error in claim-request route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}
