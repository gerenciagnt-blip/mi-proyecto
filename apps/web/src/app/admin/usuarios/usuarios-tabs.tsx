'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Shield, Building2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tabs compartidas para la sección "Usuarios" (Configuración). Cada tab
 * es un Link a su URL existente — así no movemos las carpetas pero la UX
 * se siente como un módulo unificado. La tab activa se deduce del
 * pathname.
 *
 *   /admin/usuarios           → Usuarios
 *   /admin/usuarios/roles     → Roles
 *   /admin/sucursales         → Sucursales
 *
 * Se inyecta como hijo del encabezado de cada una de esas páginas.
 */
type TabDef = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Prefijos que cuentan como "activo" además del match exacto. */
  activePrefixes?: string[];
};

const TABS: TabDef[] = [
  {
    label: 'Usuarios',
    href: '/admin/usuarios',
    icon: Users,
    // /admin/usuarios/[id] también marca activa la tab Usuarios, pero
    // /admin/usuarios/roles NO — se maneja por orden (roles se evalúa
    // primero) + regla de "prefijo exclusivo".
  },
  {
    label: 'Roles',
    href: '/admin/usuarios/roles',
    icon: Shield,
    activePrefixes: ['/admin/usuarios/roles'],
  },
  {
    label: 'Sucursales',
    href: '/admin/sucursales',
    icon: Building2,
    activePrefixes: ['/admin/sucursales'],
  },
];

function isActive(tab: TabDef, pathname: string): boolean {
  // Sucursales: cualquier ruta que empiece con /admin/sucursales
  if (tab.href === '/admin/sucursales') {
    return pathname.startsWith('/admin/sucursales');
  }
  // Roles: cualquier ruta bajo /admin/usuarios/roles
  if (tab.href === '/admin/usuarios/roles') {
    return pathname.startsWith('/admin/usuarios/roles');
  }
  // Usuarios: pathname en /admin/usuarios o subrutas, EXCEPTO /admin/usuarios/roles
  if (tab.href === '/admin/usuarios') {
    if (pathname.startsWith('/admin/usuarios/roles')) return false;
    return pathname === '/admin/usuarios' || pathname.startsWith('/admin/usuarios/');
  }
  return false;
}

export function UsuariosTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-4">
        {TABS.map((t) => {
          const active = isActive(t, pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
                active
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
