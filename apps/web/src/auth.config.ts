import type { NextAuthConfig } from 'next-auth';

// Config edge-safe — SIN imports de Prisma ni bcrypt.
// Lo que necesita el middleware (callbacks JWT/session, pages, sin providers pesados).
export const authConfig = {
  session: { strategy: 'jwt' },
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
