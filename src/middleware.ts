import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to route /uploads/* requests to /api/uploads/* so they're
 * served by the API route handler instead of Next.js static file serving.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/uploads/")) {
    const newPath = pathname.replace("/uploads/", "/api/uploads/");
    const url = req.nextUrl.clone();
    url.pathname = newPath;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/uploads/:path*"],
};
