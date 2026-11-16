import { ACCESS_TOKEN_COOKIE_NAME } from '@shipment-tracker/shared';
import { type NextRequest, NextResponse } from 'next/server';

import { loginHref } from '@/lib/next-path';

/** Optimistic check only: is there a session cookie at all? The API decides whether it is valid. */
export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(loginHref(request.nextUrl.pathname + request.nextUrl.search), request.url));
}

/** A literal: Next.js analyses it at build time. */
export const config = { matcher: ['/shipments/:path*'] };
