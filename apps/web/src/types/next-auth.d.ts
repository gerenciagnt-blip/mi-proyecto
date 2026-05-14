import type { Role } from '@pila/db';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    role: Role;
    sucursalId: string | null;
    rolCustomId: string | null;
    // Solo poblado cuando role === 'ASESOR_COMERCIAL'. Apunta al registro
    // de `AsesorComercial` (catálogo) al que está amarrado el login.
    // El scope usa este campo para filtrar Afiliaciones/Cartera.
    asesorComercialId: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      sucursalId: string | null;
      rolCustomId: string | null;
      asesorComercialId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    sucursalId: string | null;
    rolCustomId: string | null;
    asesorComercialId: string | null;
  }
}
