'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Settings,
  Building2,
  Users,
  Shield,
  Briefcase,
  Building,
  Receipt,
  Database,
  LifeBuoy,
  FileCheck,
  FileText,
  FolderArchive,
  ArrowRightLeft,
  FileSpreadsheet,
  Wallet,
  ChevronRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  children?: NavItem[];
};

const NAV: NavItem[] = [
  { label: 'Inicio', href: '/admin', icon: LayoutDashboard },
  {
    label: 'Configuración',
    icon: Settings,
    children: [
      { label: 'Sucursales', href: '/admin/sucursales', icon: Building2 },
      {
        label: 'Usuarios',
        href: '/admin/usuarios',
        icon: Users,
        children: [{ label: 'Roles', href: '/admin/usuarios/roles', icon: Shield }],
      },
      {
        label: 'Empresas',
        icon: Briefcase,
        children: [
          { label: 'Empresas planilla', href: '/admin/empresas', icon: Building },
          { label: 'Cuentas de cobro', href: '/admin/cuentas-cobro', icon: Receipt },
        ],
      },
      { label: 'Catálogos', href: '/admin/catalogos', icon: Database },
    ],
  },
  {
    label: 'Soporte',
    icon: LifeBuoy,
    children: [
      { label: 'Afiliaciones', href: '/admin/soporte/afiliaciones', icon: FileCheck },
      { label: 'Incapacidades', href: '/admin/soporte/incapacidades', icon: FileText },
    ],
  },
  { label: 'Base de datos', href: '/admin/base-datos', icon: FolderArchive },
  { label: 'Transacciones', href: '/admin/transacciones', icon: ArrowRightLeft },
  { label: 'Planos', href: '/admin/planos', icon: FileSpreadsheet },
  {
    label: 'Administrativo',
    icon: Briefcase,
    children: [
      { label: 'Cartera', href: '/admin/administrativo/cartera', icon: Wallet },
      { label: 'Incapacidades', href: '/admin/administrativo/incapacidades', icon: FileText },
    ],
  },
];

function containsActive(item: NavItem, pathname: string): boolean {
  if (item.href && (pathname === item.href || pathname.startsWith(item.href + '/'))) return true;
  return item.children?.some((c) => containsActive(c, pathname)) ?? false;
}

function isExactlyActive(href: string | undefined, pathname: string) {
  if (!href) return false;
  if (href === '/admin') return pathname === '/admin';
  return pathname === href;
}

function NavGroup({
  item,
  pathname,
  depth = 0,
}: {
  item: NavItem;
  pathname: string;
  depth?: number;
}) {
  const hasChildren = !!item.children?.length;
  const active = containsActive(item, pathname);
  const [open, setOpen] = useState(active);

  const Icon = item.icon;
  const paddingLeft = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-8' : 'pl-12';

  if (!hasChildren) {
    // Leaf
    const leafActive = isExactlyActive(item.href, pathname);
    if (!item.href) return null;
    return (
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-2.5 rounded-lg py-2 pr-3 text-sm transition',
          paddingLeft,
          leafActive
            ? 'bg-brand-blue/10 font-semibold text-brand-blue-dark'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0',
            leafActive ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-600',
          )}
        />
        <span>{item.label}</span>
      </Link>
    );
  }

  // Group with children
  const leafActive = isExactlyActive(item.href, pathname);
  return (
    <div>
      <div className="flex">
        {item.href ? (
          <Link
            href={item.href}
            className={cn(
              'group flex flex-1 items-center gap-2.5 rounded-l-lg py-2 pr-2 text-sm transition',
              paddingLeft,
              leafActive
                ? 'bg-brand-blue/10 font-semibold text-brand-blue-dark'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                leafActive ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-600',
              )}
            />
            <span>{item.label}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex flex-1 items-center gap-2.5 rounded-l-lg py-2 pr-2 text-left text-sm transition',
              paddingLeft,
              active
                ? 'font-semibold text-slate-900'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{item.label}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Contraer' : 'Expandir'}
          className="flex items-center rounded-r-lg px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')}
          />
        </button>
      </div>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {item.children!.map((c) => (
            <NavGroup key={c.label} item={c} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col p-3">
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <NavGroup key={item.label} item={item} pathname={pathname} />
        ))}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Salir del panel</span>
        </Link>
      </div>
    </nav>
  );
}
