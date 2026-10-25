import { NextResponse } from "next/server";
import { requireActor } from "@/modules/identity/get-actor";
import { UnauthorizedError } from "@/modules/identity/types";
import {
  getReadingProgress,
  updateReadingProgress,
} from "@/modules/reading";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ book: string }> | { book: string } }
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
  const book = resolvedParams.book;

  try {
    const progress = await getReadingProgress(actor.userId, book);

    if (!progress) {
      return NextResponse.json(
        { progress: null },
        { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
      );
    }

    return NextResponse.json(
      {
        progress,
        ...progress,
        lastSeenAt: progress.lastSeenAt.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  } catch (error: unknown) {
    console.error("Error in reading-progress GET route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ book: string }> | { book: string } }
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
  const book = resolvedParams.book;

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

  const chapterId = typeof payload.chapterId === "string" ? payload.chapterId.trim() : "";
  if (!chapterId) {
    return NextResponse.json(
      { error: "Invalid body: 'chapterId' is required" },
      { status: 400, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }

  const revisionId =
    typeof payload.revisionId === "string" ? payload.revisionId.trim() : undefined;
  const anchorId =
    typeof payload.anchorId === "string" ? payload.anchorId.trim() : undefined;

  try {
    await updateReadingProgress(
      actor.userId,
      book,
      chapterId,
      anchorId,
      revisionId
    );

    return NextResponse.json(
      { updated: true },
      { status: 200, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  } catch (error: unknown) {
    console.error("Error in reading-progress PUT route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "Cache-Control": "private, no-cache, no-store" } }
    );
  }
}
