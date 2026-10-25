import { NextResponse } from "next/server";
import { getOfferQuote, OfferNotFoundError, ValidationError } from "@/modules/commerce";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ offerId: string }> | { offerId: string } }
): Promise<Response> {
  try {
    const resolvedParams = await Promise.resolve(params);
    const offerId = resolvedParams.offerId;

    const quote = await getOfferQuote(offerId);

    const serialized = {
      ...quote,
      subtotal: quote.subtotal.toString(),
      discount: quote.discount.toString(),
      tax: quote.tax.toString(),
      payable: quote.payable.toString(),
      createdAt: quote.createdAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
    };

    return NextResponse.json(serialized, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof OfferNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    if (error instanceof ValidationError) {
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
