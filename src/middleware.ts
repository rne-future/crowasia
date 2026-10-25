import { authMiddleware } from "@/shared/auth/middleware";

export default authMiddleware;

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

