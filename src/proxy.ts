import { NextResponse, type NextRequest } from "next/server";
import { isBasicAuthAllowed } from "@/lib/security/basic-auth";

export function proxy(request: NextRequest) {
  const allowed = isBasicAuthAllowed(request.headers.get("authorization"), {
    user: process.env.APP_BASIC_AUTH_USER,
    password: process.env.APP_BASIC_AUTH_PASSWORD,
  });

  if (allowed) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Article LP Asset DB", charset="UTF-8"',
      "cache-control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
