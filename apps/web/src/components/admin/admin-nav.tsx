'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Settings,
  Users,
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
  Users2,
  Sparkles,
  FileSignature,
  ChevronRight,
  LogOut,
  DollarSign,
  BarChart3,
  History,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@pila/db';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/app/dashboard/actions';

/** Conjuntos de roles (para dejar intención clara en la matriz). */
const STAFF: Role[] = ['ADMIN', 'SOPORTE'];
/** Staff + dueño aliado — para entradas que el aliado debe poder ver
 *  scopeadas a su sucursal (ej. bitácora). */
const STAFF_Y_ALIADO_OWNER: Role[] = ['ADMIN', 'SOPORTE', 'ALIADO_OWNER'];

type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  children?: NavItem[];
  /**
   * Roles que ven este item. Omitido ⇒ visible para todos los
   * autenticados. Los grupos se auto-ocultan si ninguno de sus hijos
   * aplica al rol actual.
   */
  roles?: Role[];
};

const NAV: NavItem[] = [
  { label: 'Inicio', href: '/admin', icon: LayoutDashboard },
  { label: 'Dashboard ejecutivo', href: '/admin/dashboard-ejecutivo', icon: BarChart3 },
  {
    label: 'Configuración',
    icon: Settings,
    children: [
      { label: 'Empresas planilla', href: '/admin/empresas', icon: Building, roles: STAFF },
      { label: 'Empresa CC', href: '/admin/cuentas-cobro', icon: Receipt },
      // Usuarios incluye una tab interna a /admin/sucursales — no
      // exponemos "Sucursales" como entrada separada del nav.
      { label: 'Usuarios', href: '/admin/usuarios', icon: Users, roles: STAFF },
      { label: 'Parametrización', href: '/admin/catalogos', icon: Database, roles: STAFF },
      { label: 'Asesor comercial', href: '/admin/catalogos/asesores', icon: Users2 },
      { label: 'Servicios adicionales', href: '/admin/catalogos/servicios', icon: Sparkles },
      { label: 'Formato comprobante', href: '/admin/catalogos/comprobantes', icon: FileSignature },
      {
        label: 'Bitácora',
        href: '/admin/configuracion/bitacora',
        icon: History,
        roles: STAFF_Y_ALIADO_OWNER,
      },
    ],
  },
  {
    label: 'Soporte',
    icon: LifeBuoy,
    roles: STAFF,
    children: [
      { label: 'Cartera', href: '/admin/soporte/cartera', icon: Wallet },
      { label: 'Afiliaciones', href: '/admin/soporte/afiliaciones', icon: FileCheck },
      { label: 'Incapacidades', href: '/admin/soporte/incapacidades', icon: FileText },
      { label: 'Finanzas', href: '/admin/soporte/finanzas', icon: DollarSign },
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

/** Filtra el árbol de navegación según el rol; oculta grupos vacíos. */
function filtrarPorRol(items: NavItem[], role: Role): NavItem[] {
  const out: NavItem[] = [];
  for (const it of items) {
    // Si el item restringe y el rol no está, lo saltamos.
    if (it.roles && !it.roles.includes(role)) continue;
    if (it.children && it.children.length > 0) {
      const hijos = filtrarPorRol(it.children, role);
      if (hijos.length === 0) continue; // grupo vacío ⇒ ocultar
      out.push({ ...it, children: hijos });
    } else {
      out.push(it);
    }
  }
  return out;
}

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
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
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

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname() ?? '';
  const items = filtrarPorRol(NAV, role);

  return (
    <nav className="flex h-full flex-col p-3">
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <NavGroup key={item.label} item={item} pathname={pathname} />
        ))}
      </div>

      <form action={logoutAction} className="border-t border-slate-100 pt-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Cerrar sesión</span>
        </button>
      </form>
    </nav>
  );
}

// Re-exportamos también el array filtrado como helper si alguien más
// lo necesita (futuro: breadcrumb, búsqueda, etc).
export { filtrarPorRol, NAV, type NavItem };
