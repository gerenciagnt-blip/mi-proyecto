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
  DollarSign,
  History,
  Activity,
  Bot,
  Scale,
  ClipboardList,
  Star,
  FileWarning,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@pila/db';
import { cn } from '@/lib/utils';

/** Conjuntos de roles (para dejar intención clara en la matriz). */
const STAFF: Role[] = ['ADMIN', 'SOPORTE'];
/** Staff + dueño aliado — para entradas que el aliado debe poder ver
 *  scopeadas a su sucursal (ej. bitácora). */
const STAFF_Y_ALIADO_OWNER: Role[] = ['ADMIN', 'SOPORTE', 'ALIADO_OWNER'];
/** Solo ADMIN — operaciones internas/sistema. */
const ADMIN_ONLY: Role[] = ['ADMIN'];

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
  /**
   * Sprint Permisos — módulo asociado al item. Si está y el user no
   * lo tiene en su set de módulos accesibles (calculado server-side
   * por `puedeAccederModulo`), el item se oculta. Esto hace que la
   * matriz `RolCustom` filtre el nav, no solo bloquee el acceso a la
   * page. Items sin `modulo` se rigen solo por `roles?` como antes.
   */
  modulo?: string;
};

const NAV: NavItem[] = [
  // Inicio incluye el dashboard ejecutivo (sprint reorg 2026-04-27).
  // La ruta /admin/dashboard-ejecutivo sigue siendo válida pero
  // redirige a /admin para no romper bookmarks.
  { label: 'Inicio', href: '/admin', icon: LayoutDashboard },
  {
    label: 'Configuración',
    icon: Settings,
    children: [
      {
        label: 'Empresas planilla',
        href: '/admin/empresas',
        icon: Building,
        roles: STAFF,
        modulo: 'config.empresas_planilla',
      },
      { label: 'Empresa CC', href: '/admin/cuentas-cobro', icon: Receipt, modulo: 'cuentas_cobro' },
      // Usuarios incluye una tab interna a /admin/sucursales — no
      // exponemos "Sucursales" como entrada separada del nav.
      {
        label: 'Usuarios',
        href: '/admin/usuarios',
        icon: Users,
        roles: STAFF,
        modulo: 'config.usuarios',
      },
      {
        label: 'Parametrización',
        href: '/admin/catalogos',
        icon: Database,
        roles: STAFF,
        modulo: 'config.catalogos',
      },
      {
        label: 'Asesor comercial',
        href: '/admin/catalogos/asesores',
        icon: Users2,
        modulo: 'config.asesores_comerciales',
      },
      {
        label: 'Servicios adicionales',
        href: '/admin/catalogos/servicios',
        icon: Sparkles,
        modulo: 'config.servicios_adicionales',
      },
      {
        label: 'Formato comprobante',
        href: '/admin/catalogos/comprobantes',
        icon: FileSignature,
        modulo: 'config.formato_comprobante',
      },
      {
        label: 'Bitácora',
        href: '/admin/configuracion/bitacora',
        icon: History,
        roles: STAFF_Y_ALIADO_OWNER,
        modulo: 'config.bitacora',
      },
      {
        label: 'Bot Colpatria',
        href: '/admin/configuracion/colpatria-jobs',
        icon: Bot,
        roles: STAFF,
        modulo: 'config.colpatria_jobs',
      },
      {
        label: 'Sistema',
        href: '/admin/sistema',
        icon: Activity,
        roles: ADMIN_ONLY,
        modulo: 'config.sistema',
      },
    ],
  },
  {
    label: 'Soporte',
    icon: LifeBuoy,
    roles: STAFF,
    children: [
      { label: 'Cartera', href: '/admin/soporte/cartera', icon: Wallet, modulo: 'soporte.cartera' },
      {
        label: 'Afiliaciones',
        href: '/admin/soporte/afiliaciones',
        icon: FileCheck,
        modulo: 'soporte.afiliaciones',
      },
      {
        label: 'Incapacidades',
        href: '/admin/soporte/incapacidades',
        icon: FileText,
        modulo: 'soporte.incapacidades',
      },
      // Sprint Jurídico — bandeja de casos derivados al área legal.
      // Visible a todo STAFF; los documentos confidenciales se filtran
      // por permiso `soporte.juridico_confidencial` en el endpoint.
      {
        label: 'Jurídico',
        href: '/admin/soporte/juridico',
        icon: Scale,
        modulo: 'soporte.juridico',
      },
      // Finanzas raíz: usamos el módulo del sub-tab default (cobro_aliados).
      // Si el user no tiene ninguno de los 3 sub-módulos, el grupo Soporte
      // se auto-oculta porque su único hijo desaparece.
      {
        label: 'Finanzas',
        href: '/admin/soporte/finanzas',
        icon: DollarSign,
        modulo: 'soporte.finanzas.cobro_aliados',
      },
      {
        label: 'Reporte AT',
        href: '/admin/soporte/reporte-at',
        icon: ClipboardList,
        modulo: 'soporte.reporte_at',
      },
      // Sprint Chat · cierre+rating — dashboard de calificaciones que
      // los aliados dejan al cerrar conversaciones con staff.
      {
        label: 'Calificaciones chat',
        href: '/admin/soporte/calificaciones-chat',
        icon: Star,
        modulo: 'soporte.calificaciones_chat',
      },
      // Sprint PagoSimple Errores — bandeja staff de planillas que
      // fallaron la validación contra el operador.
      {
        label: 'Planillas con errores',
        href: '/admin/soporte/planillas-errores',
        icon: FileWarning,
        modulo: 'soporte.planillas_errores',
      },
    ],
  },
  { label: 'Base de datos', href: '/admin/base-datos', icon: FolderArchive, modulo: 'base_datos' },
  // Sprint Chat interno — la entrada de chat NO está en el nav: vive
  // como widget flotante global (admin-shell.tsx → ChatWidget) y siempre
  // está a un click de distancia. La página /admin/chat se conserva
  // como deep-link, pero no se navega desde el menú lateral.
  {
    label: 'Transacciones',
    href: '/admin/transacciones',
    icon: ArrowRightLeft,
    modulo: 'transacciones',
  },
  { label: 'Planos', href: '/admin/planos', icon: FileSpreadsheet, modulo: 'planos' },
  {
    label: 'Administrativo',
    icon: Briefcase,
    children: [
      {
        label: 'Cartera',
        href: '/admin/administrativo/cartera',
        icon: Wallet,
        modulo: 'admin.cartera',
      },
      {
        label: 'Incapacidades',
        href: '/admin/administrativo/incapacidades',
        icon: FileText,
        modulo: 'admin.incapacidades',
      },
      {
        label: 'Reporte AT',
        href: '/admin/administrativo/reporte-at',
        icon: ClipboardList,
        modulo: 'admin.reporte_at',
      },
    ],
  },
];

/**
 * Filtra el árbol de navegación según rol base + permisos granulares.
 * Reglas:
 *  - `item.modulo` y `accesibles` provistos: si el módulo no está en
 *    `accesibles`, el item se oculta (RolCustom efectivo en el menú).
 *  - `item.roles`: si el rol no está incluido, se oculta (compat).
 *  - Grupo sin hijos visibles → se oculta.
 *
 * Si `accesibles` es undefined (caller no calculó permisos), solo se
 * aplica filtrado por `roles` — comportamiento legacy. Esto evita que
 * el nav quede vacío si por alguna razón el cálculo server-side falla.
 */
function filtrarNav(items: NavItem[], role: Role, accesibles?: Set<string>): NavItem[] {
  const out: NavItem[] = [];
  for (const it of items) {
    if (it.modulo && accesibles && !accesibles.has(it.modulo)) continue;
    if (it.roles && !it.roles.includes(role)) continue;
    if (it.children && it.children.length > 0) {
      const hijos = filtrarNav(it.children, role, accesibles);
      if (hijos.length === 0) continue;
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

export function AdminNav({
  role,
  modulosAccesibles,
}: {
  role: Role;
  /**
   * Set de módulos a los que el user tiene acceso (calculado server-side
   * por `puedeAccederModulo`). Si es undefined, solo se filtra por rol
   * base (backward compat).
   */
  modulosAccesibles?: string[];
}) {
  const pathname = usePathname() ?? '';
  const accesibles = modulosAccesibles ? new Set(modulosAccesibles) : undefined;
  const items = filtrarNav(NAV, role, accesibles);

  return (
    <nav className="flex h-full flex-col p-3">
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <NavGroup key={item.label} item={item} pathname={pathname} />
        ))}
      </div>
      {/* Sprint Soporte reorg fase 2 — Cerrar sesión vive ahora solo
         en el header (al lado de "Mi perfil"). Quitamos el botón
         duplicado del fondo del sidebar. */}
    </nav>
  );
}

// Re-exportamos también el array filtrado como helper si alguien más
// lo necesita (futuro: breadcrumb, búsqueda, etc).
export { filtrarNav, NAV, type NavItem };
