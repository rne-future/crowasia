import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  })),
}));

import { updateSession, authMiddleware } from "@/shared/auth/middleware";

describe("Auth Middleware", () => {
  it("updateSession refreshes user session and returns response", async () => {
    const request = new NextRequest("https://crowasia.test/id/catalog");
    const response = await updateSession(request);

    expect(response).toBeInstanceOf(NextResponse);
  });

  it("authMiddleware applies i18n routing and session refresh", async () => {
    const request = new NextRequest("https://crowasia.test/");
    const response = await authMiddleware(request);

    expect(response).toBeInstanceOf(NextResponse);
  });

  it("authMiddleware sets private, no-store Cache-Control on reader routes", async () => {
    const request = new NextRequest("https://crowasia.test/id/read/mahir-memimpin-tim/ch-2");
    const response = await authMiddleware(request);

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("authMiddleware sets private, no-store Cache-Control on dashboard routes", async () => {
    const request = new NextRequest("https://crowasia.test/id/dashboard");
    const response = await authMiddleware(request);

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
