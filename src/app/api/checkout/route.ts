import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/modules/identity/get-actor";
import {
  createCheckoutOrder,
  ConflictError,
  QuoteExpiredError,
  OfferNotFoundError,
  ValidationError,
  InvalidQuoteError,
} from "@/modules/commerce";

function getCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const idempotencyKey = request.headers.get("idempotency-key") || request.headers.get("Idempotency-Key");
    if (!idempotencyKey || !idempotencyKey.trim()) {
      return NextResponse.json(
        { error: "Missing Idempotency-Key header", code: "MISSING_IDEMPOTENCY_KEY" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    const { offerId, email, name, mobile, quoteToken, quote } = body || {};
    if (!offerId || !email || !name || !mobile) {
      return NextResponse.json(
        { error: "Missing required checkout fields: offerId, email, name, mobile", code: "MISSING_FIELDS" },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    const actor = await getActor(request).catch(() => null);

    let guestSessionId: string | undefined;
    let newGuestSessionSet = false;

    if (!actor) {
      const existingCookie = getCookie(request.headers.get("cookie"), "guest_session");
      if (existingCookie) {
        guestSessionId = existingCookie;
      } else {
        guestSessionId = randomUUID();
        newGuestSessionSet = true;
      }
    }

    const result = await createCheckoutOrder(
      {
        offerId,
        email,
        name,
        mobile,
        quoteToken,
        quote,
      },
      idempotencyKey.trim(),
      actor,
      guestSessionId
    );

    const statusCode = result.status === "CREATE_UNKNOWN" ? 202 : result.idempotentReplay ? 200 : 201;

    const response = NextResponse.json(result, {
      status: statusCode,
      headers: {
        "Cache-Control": "private, no-cache, no-store",
      },
    });

    if (newGuestSessionSet && guestSessionId) {
      response.cookies.set("guest_session", guestSessionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    if (error instanceof QuoteExpiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    if (error instanceof ValidationError || error instanceof InvalidQuoteError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}
