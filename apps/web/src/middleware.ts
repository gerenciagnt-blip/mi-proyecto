import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

// Middleware usa solo authConfig (sin Prisma/bcrypt) para correr en Edge runtime
const { auth } = NextAuth(authConfig);

/**
 * Genera un nonce criptográfico (base64) para usar en `Content-Security-Policy`
 * con la directiva `nonce-XXX`. Cada request tiene su propio nonce; los
 * `<script>` y `<style>` que necesiten ejecutar inline lo leen del header
 * `x-nonce` que le inyectamos al request.
 *
 * Crypto.getRandomValues está disponible en Edge runtime (donde corre este
 * middleware) sin importar nada más.
 */
function generarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 URL-safe sin padding — 22 chars
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Construye la directiva CSP. Notas:
 *
 *  - `'strict-dynamic'`: cuando un script con nonce válido carga otros
 *    scripts dinámicamente (ej: Next.js runtime), se les confía sin
 *    necesidad de listarlos. Es la forma moderna recomendada por Google.
 *  - `'unsafe-inline'`: queda como FALLBACK para browsers viejos que no
 *    entienden `'strict-dynamic'`. Los browsers modernos LO IGNORAN si
 *    hay nonce o `strict-dynamic`. No relaja la seguridad real.
 *  - Estilos: Next 15 inyecta CSS inline en HMR de dev. En prod los
 *    consolida; aún así dejamos `'unsafe-inline'` en style-src porque
 *    Tailwind + algunas librerías UI lo necesitan. Migrar a nonces en
 *    style-src es un sprint adicional.
 *  - `connect-src`: incluye Sentry y PagoSimple si están seteados.
 */
function construirCSP(nonce: string): string {
  const sentryHost = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host
    : '';
  const pagosimpleHost = process.env.PAGOSIMPLE_BASE_URL
    ? new URL(process.env.PAGOSIMPLE_BASE_URL).host
    : '';

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${sentryHost ? `https://${sentryHost}` : ''} ${pagosimpleHost ? `https://${pagosimpleHost}` : ''}`.trim(),
    `frame-ancestors 'none'`, // refuerzo de X-Frame-Options
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ];
  return directives.filter(Boolean).join('; ');
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Rutas públicas: login, callbacks de NextAuth y endpoints de monitoreo.
  // El health check es público a propósito — no expone información sensible
  // y debe ser accesible para uptime monitors, Kubernetes probes, etc.
  const isPublic =
    pathname === '/login' || pathname.startsWith('/api/auth') || pathname === '/api/health';

  // Generamos el nonce y la CSP para CADA request — son baratos.
  // El nonce se inyecta en el request header `x-nonce` para que los
  // server components / layouts lo puedan leer (vía `headers()` de Next)
  // si en el futuro queremos meter scripts inline con nonce.
  const nonce = generarNonce();
  const csp = construirCSP(nonce);

  // En este momento publicamos la CSP en modo "Report-Only" para detectar
  // violations sin bloquear nada (Next 15 inyecta scripts internos en dev
  // y queremos verificar que con `nonce + strict-dynamic` los acepta antes
  // de promover a CSP real). Cuando se confirme que no hay violations en
  // logs del browser durante una semana, cambiar al header sin "-Report-Only".
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);

  let response: NextResponse;
  if (isPublic) {
    response = NextResponse.next({ request: { headers: reqHeaders } });
  } else if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next({ request: { headers: reqHeaders } });
  }

  // CSP en cualquier respuesta (incluso redirects) y nonce reflected.
  response.headers.set('Content-Security-Policy-Report-Only', csp);
  response.headers.set('x-nonce', nonce);
  return response;
});

export const config = {
  // Excluir assets estáticos (imagenes, fuentes, css/js publicos) para que
  // no pasen por el auth middleware y reciban un redirect 307 a /login.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)$).*)',
  ],
};
