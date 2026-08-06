import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new NextResponse("SESSION_SECRET is not configured", { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyToken(token, secret)) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Come back to whatever they were reaching for after signing in.
  if (request.nextUrl.pathname !== "/") {
    login.searchParams.set("next", request.nextUrl.pathname);
  }
  return NextResponse.redirect(login);
}

export const config = {
  /*
   * Everything is protected except the login screen itself and Next's own
   * static assets — including /api/photo, which is the whole reason the Blob
   * store stays private.
   *
   * Note this is `proxy.ts`, not `middleware.ts`: Next 16 renamed the
   * convention and the exported function. It runs on the Node.js runtime.
   */
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
