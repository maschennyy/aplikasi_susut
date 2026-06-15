import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/flask-login"]);
const PASSTHROUGH_PREFIXES = [
  "/_next",
  "/flask-api",
  "/flask-login",
  "/flask-logout",
  "/flask-ui",
];

function isPassthroughPath(pathname: string) {
  return PASSTHROUGH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || isPassthroughPath(pathname)) {
    return NextResponse.next();
  }

  const hasFlaskSession = request.cookies.has("session");
  if (!hasFlaskSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
