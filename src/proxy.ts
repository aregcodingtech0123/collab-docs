// Rejects URLs with a malformed percent-escape (e.g. /api/documents/%E0%A4%A) with a clean 400.
//
// Without this, Next throws while decoding the dynamic [id] segment, before any of our code
// runs, and answers with a bare 500. Doing it here, before routing, keeps "bad input is
// never a 5xx" true for every route that has a dynamic segment.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = new URL(request.url);
  try {
    decodeURIComponent(pathname);
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "The URL is malformed." } },
        { status: 400 },
      );
    }
    return new NextResponse("Bad request: the URL is malformed.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // Only the routes that have a dynamic [id] segment. /api/documents/import is excluded on
  // purpose: Next buffers the request body (up to 10 MB) of every route the proxy matches,
  // which would defeat the streaming size limit in lib/import/upload.ts.
  matcher: ["/documents/:id", "/api/documents/:id((?!import$)[^/]+)", "/api/documents/:id/shares"],
};
