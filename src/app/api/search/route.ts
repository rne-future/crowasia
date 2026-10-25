import { type NextRequest, NextResponse } from "next/server";
import { getActor } from "@/modules/identity/get-actor";
import { searchTopics } from "@/modules/search/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const locale = searchParams.get("locale") || "id";

  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
  };

  const trimmed = q.trim();

  if (trimmed.length > 120) {
    return NextResponse.json(
      { error: "Query exceeds maximum length of 120 characters" },
      { status: 400, headers }
    );
  }

  if (trimmed.length < 2) {
    return NextResponse.json(
      {
        query: q,
        locale,
        total: 0,
        results: [],
      },
      { status: 200, headers }
    );
  }

  const actor = await getActor(request).catch(() => null);
  const result = await searchTopics(trimmed, locale, actor);

  // Enforce max 20 results
  if (result.results.length > 20) {
    result.results = result.results.slice(0, 20);
    result.total = result.results.length;
  }

  return NextResponse.json(result, { status: 200, headers });
}
