import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/flask-login"]);
const PASSTHROUGH_PREFIXES = [
  "/_next",
  "/flask-api",
  "/flask-login",
  "/flask-logout",
];
const SESSION_CHECK_PATH = "/flask-api/me";

function isPassthroughPath(pathname: string) {
  return PASSTHROUGH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function loginRedirect(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

async function hasValidFlaskSession(request: NextRequest) {
  if (!request.cookies.has("session")) return false;

  try {
    const sessionCheckUrl = new URL(SESSION_CHECK_PATH, request.nextUrl.origin);
    const response = await fetch(sessionCheckUrl, {
      cache: "no-store",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      redirect: "manual",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || isPassthroughPath(pathname)) {
    return NextResponse.next();
  }

  const isSessionValid = await hasValidFlaskSession(request);
  if (!isSessionValid) {
    return loginRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
