import { NextResponse } from "next/server";

const TARGET_ORIGIN = "https://downloader.bhwa233.com";

export function proxy(request) {
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, TARGET_ORIGIN);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: "/:path*",
};
