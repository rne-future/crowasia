import { NextResponse } from "next/server";
import { getActor } from "@/modules/identity/get-actor";
import {
  getOrderStatus,
  OrderNotFoundError,
  ForbiddenError,
  ValidationError,
} from "@/modules/commerce";

function getCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> | { orderId: string } }
): Promise<Response> {
  try {
    const resolvedParams = await Promise.resolve(params);
    const orderId = resolvedParams.orderId;

    const actor = await getActor(request).catch(() => null);
    const guestSessionId = getCookie(request.headers.get("cookie"), "guest_session");

    const orderStatus = await getOrderStatus(orderId, actor, guestSessionId);

    const serialized = {
      ...orderStatus,
      payable: orderStatus.payable.toString(),
      paidAt: orderStatus.paidAt ? orderStatus.paidAt.toISOString() : null,
      createdAt: orderStatus.createdAt.toISOString(),
      items: orderStatus.items.map((item) => ({
        ...item,
        price: item.price.toString(),
      })),
    };

    return NextResponse.json(serialized, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: 403, headers: { "Cache-Control": "private, no-cache, no-store" } }
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
