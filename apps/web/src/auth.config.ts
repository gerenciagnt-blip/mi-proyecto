import type { NextAuthConfig } from 'next-auth';

// Timeout de inactividad: la sesión JWT expira a los 5 minutos desde la
// última actividad. `updateAge` regenera el token cuando han pasado más
// de 60 s, así cualquier request (navegación, refresh, POST) renueva la
// expiración. Si el usuario se queda quieto > 5 min → el middleware
// detecta la sesión vencida y redirige a /login.
const SESSION_MAX_AGE_SECONDS = 5 * 60; // 5 minutos
const SESSION_UPDATE_AGE_SECONDS = 60; // refrescar cada 1 min de actividad

// Config edge-safe — SIN imports de Prisma ni bcrypt.
// Lo que necesita el middleware (callbacks JWT/session, pages, sin providers pesados).
export const authConfig = {
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/login' },
  providers: [], // los providers reales se agregan en auth.ts (Node runtime)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.sucursalId = user.sucursalId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.sucursalId = token.sucursalId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
