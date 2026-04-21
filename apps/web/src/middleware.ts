import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

// Middleware usa solo authConfig (sin Prisma/bcrypt) para correr en Edge runtime
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isPublic = pathname === '/login' || pathname.startsWith('/api/auth');
  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Excluir assets estáticos (imagenes, fuentes, css/js publicos) para que
  // no pasen por el auth middleware y reciban un redirect 307 a /login.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)$).*)',
  ],
};
