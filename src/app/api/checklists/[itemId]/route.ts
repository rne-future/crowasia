import { NextResponse } from "next/server";
import { requireActor } from "@/modules/identity/get-actor";
import { UnauthorizedError } from "@/modules/identity/types";
import {
  updateChecklistProgress,
  ProgressConflictError,
  GoneError,
  NotFoundError,
} from "@/modules/reading";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> | { itemId: string } }
): Promise<Response> {
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
      { error: "Unauthorized: actor authentication required" },
      { status: 401, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  const resolvedParams = await Promise.resolve(params);
  const itemId = resolvedParams.itemId;

  if (!itemId || !UUID_REGEX.test(itemId)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_ITEM_ID",
          message: "Item ID must be a valid UUID",
        },
      },
      { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  const payload =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (typeof payload.completed !== "boolean" || typeof payload.expectedVersion !== "number") {
    return NextResponse.json(
      { error: "Invalid body: 'completed' (boolean) and 'expectedVersion' (number) are required" },
      { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  try {
    const result = await updateChecklistProgress(
      actor.userId,
      itemId,
      payload.completed,
      payload.expectedVersion
    );

    return NextResponse.json(
      {
        itemId: result.itemId,
        completed: result.completed,
        version: result.version,
        updatedAt: result.updatedAt.toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store" },
      }
    );
  } catch (error: unknown) {
    if (error instanceof ProgressConflictError) {
      return NextResponse.json(
        {
          error: {
            code: "PROGRESS_CONFLICT",
            message: "Progres berubah di perangkat lain",
          },
          current: {
            completed: error.current.completed,
            version: error.current.version,
          },
        },
        { status: 409, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    if (error instanceof GoneError) {
      return NextResponse.json(
        {
          error: {
            code: "ITEM_RETIRED",
            message: "Item ini sudah tidak berlaku",
          },
        },
        { status: 410, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: error.message || "Item not found",
          },
        },
        { status: 404, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    console.error("Error in checklists PUT route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}
