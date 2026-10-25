import { NextResponse } from "next/server";
import { requireActor } from "@/modules/identity/get-actor";
import { UnauthorizedError } from "@/modules/identity/types";
import {
  claimPurchase,
  ClaimForbiddenError,
} from "@/modules/entitlements";

export async function POST(request: Request): Promise<Response> {
  let actor;
  try {
    actor = await requireActor(request);
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  try {
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
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    const result = await claimPurchase(token, actor);

    return NextResponse.json(
      {
        claimed: true,
        orderId: result.orderId,
        grantsCount: result.grantsCount,
      },
      { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof ClaimForbiddenError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    console.error("Error in purchases/claim route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}
