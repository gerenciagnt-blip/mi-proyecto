import type { Role } from '@pila/db';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    role: Role;
    sucursalId: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      sucursalId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    sucursalId: string | null;
  }
}
