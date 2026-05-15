import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@pila/db';
import { authConfig } from './auth.config';
import {
  extraerIpDeHeaders,
  getRateLimitStatus,
  getRateLimitStatusByIp,
  registrarIntentoExitoso,
  registrarIntentoFallido,
} from './lib/auth-rate-limit';
import { withDbRetry } from './lib/db-retry';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const emailNorm = email.toLowerCase();

        // Extraer IP del cliente — viaja en x-forwarded-for detrás de
        // un proxy (Vercel, DO App Platform, Caddy reverso). En dev
        // local puede ser null.
        const ip = request?.headers ? extraerIpDeHeaders(request.headers) : null;
        const userAgent = request?.headers?.get('user-agent') ?? undefined;
        const meta = ip || userAgent ? { ip: ip ?? undefined, userAgent } : undefined;

        // 1a. Rate limit por IP — anti credential-stuffing distribuido.
        //     Se chequea ANTES que el bucket por email para frenar bots
        //     que rotan emails sin gastar bcrypt ni queries de usuario.
        const ipStatus = await getRateLimitStatusByIp(ip);
        if (ipStatus.bloqueado) {
          await registrarIntentoFallido(emailNorm, 'rate_limited', meta);
          return null;
        }

        // 1b. Rate limit por email — anti fuerza-bruta dirigida.
        const status = await getRateLimitStatus(emailNorm);
        if (status.bloqueado) {
          await registrarIntentoFallido(emailNorm, 'rate_limited', meta);
          return null;
        }

        // Retry transitorio: cubre cold-start de Neon en el lookup del
        // usuario (segunda query crítica del flujo de login).
        const user = await withDbRetry(
          () =>
            prisma.user.findUnique({
              where: { email: emailNorm },
            }),
          { label: 'authorize.user.findUnique' },
        );

        if (!user) {
          await registrarIntentoFallido(emailNorm, 'unknown_email', meta);
          return null;
        }

        if (!user.active) {
          await registrarIntentoFallido(emailNorm, 'user_inactive', meta);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await registrarIntentoFallido(emailNorm, 'password_wrong', meta);
          return null;
        }

        // 2. Login exitoso → registra (con info del usuario para AuditLog)
        //    y limpia intentos fallidos previos
        await registrarIntentoExitoso(emailNorm, { id: user.id, name: user.name }, meta);

        // 3. Marcar presencia activa de inmediato — sin esperar al primer
        //    heartbeat (que tarda hasta 30s). Así el chat ve al user
        //    como ONLINE en el momento mismo del login.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastActiveAt: new Date() },
          });
        } catch {
          // best-effort: si falla la presencia el login igual procede
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sucursalId: user.sucursalId,
          // Sprint Jurídico — `rolCustomId` viaja en el JWT para chequear
          // permisos finos (ej: descargar documentos confidenciales) sin
          // tener que consultar BD en cada request.
          rolCustomId: user.rolCustomId,
          // Sprint Asesor Comercial — `asesorComercialId` viaja en el JWT
          // para que el scope filtre Afiliaciones/Cartera sin un round-trip
          // a BD. Es null para todos los roles excepto ASESOR_COMERCIAL.
          asesorComercialId: user.asesorComercialId,
        };
      },
    }),
  ],
});
