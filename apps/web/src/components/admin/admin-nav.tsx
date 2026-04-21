'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Users,
  Database,
  Receipt,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon };

const MAIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Inicio', icon: LayoutDashboard },
  { href: '/admin/sucursales', label: 'Sucursales', icon: Building2 },
  { href: '/admin/empresas', label: 'Empresas', icon: Briefcase },
  { href: '/admin/cuentas-cobro', label: 'Cuentas de cobro', icon: Receipt },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/catalogos', label: 'Catálogos', icon: Database },
];

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="flex h-full flex-col p-3">
      <div className="flex flex-1 flex-col gap-1">
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                active
                  ? 'bg-brand-blue/10 text-brand-blue-dark'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition',
                  active ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-600',
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Volver al dashboard</span>
        </Link>
      </div>
    </nav>
  );
}
