import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { env } from "@/shared/config/env";
import { routing } from "@/shared/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function updateSession(
  request: NextRequest,
  response?: NextResponse
): Promise<NextResponse> {
  const supabaseResponse = response ?? NextResponse.next({ request });

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse> {
  const intlResponse = intlMiddleware(request);
  const response = await updateSession(request, intlResponse);

  // Enforce private, no-store on interactive reader and user dashboard routes
  if (
    request.nextUrl.pathname.includes("/read/") ||
    request.nextUrl.pathname.includes("/dashboard")
  ) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}
