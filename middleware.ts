import { NextResponse, type NextRequest } from 'next/server';

const LEGACY_INSIGHT_HUB_PATHS = new Set([
  '/portal/prospects',
  '/portal/clients',
  '/portal/entities',
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LEGACY_INSIGHT_HUB_PATHS.has(pathname) || pathname.startsWith('/portal/prospects/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portal/:path*'],
};
