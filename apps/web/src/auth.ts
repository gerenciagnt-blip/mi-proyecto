import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@pila/db';
import { authConfig } from './auth.config';
import {
  getRateLimitStatus,
  registrarIntentoFallido,
  registrarIntentoExitoso,
} from './lib/auth-rate-limit';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const emailNorm = email.toLowerCase();

        // 1. Rate limit: si ya está bloqueado, denegar aunque las
        //    credenciales sean correctas (evita que pasen por fuerza
        //    bruta cuando adivinan dentro de la ventana).
        const status = await getRateLimitStatus(emailNorm);
        if (status.bloqueado) {
          await registrarIntentoFallido(emailNorm, 'rate_limited');
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: emailNorm },
        });

        if (!user) {
          await registrarIntentoFallido(emailNorm, 'unknown_email');
          return null;
        }

        if (!user.active) {
          await registrarIntentoFallido(emailNorm, 'user_inactive');
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await registrarIntentoFallido(emailNorm, 'password_wrong');
          return null;
        }

        // 2. Login exitoso → registra (con info del usuario para AuditLog)
        //    y limpia intentos fallidos previos
        await registrarIntentoExitoso(emailNorm, {
          id: user.id,
          name: user.name,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sucursalId: user.sucursalId,
        };
      },
    }),
  ],
});
