import Link from 'next/link';
import {
  Briefcase,
  UserCheck,
  Database,
  CreditCard,
  DollarSign,
  Layers3,
  Percent,
  type LucideIcon,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { scopeWhereOpt } from '@/lib/sucursal-scope';

export const metadata = { title: 'Parametrización — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Card = {
  href: string;
  label: string;
  count: number;
  icon: LucideIcon;
  desc: string;
  sub?: string;
};

export default async function ParametrizacionPage() {
  // Medios de pago es el único catálogo con scope por sucursal en este hub.
  // Los demás son globales (entidades, actividades, tipos, planes, tarifas,
  // SMLV) — todos los usuarios ven el mismo count.
  const mediosWhere = await scopeWhereOpt();

  const [
    entidadesPorTipo,
    actividades,
    tipos,
    subtipos,
    medios,
  ] = await Promise.all([
    prisma.entidadSgss.groupBy({ by: ['tipo'], _count: true }),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
    prisma.subtipo.count(),
    prisma.medioPago.count({ where: mediosWhere }),
  ]);

  const planesCount = await prisma.planSgss.count();
  const tarifasCount = await prisma.tarifaSgss.count({ where: { active: true } });
  const fspCount = await prisma.fspRango.count({ where: { active: true } });
  const smlvConfig = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  const copFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  const counts = Object.fromEntries(
    entidadesPorTipo.map((r) => [r.tipo, r._count]),
  ) as Record<string, number>;
  const totalEntidades =
    (counts.EPS ?? 0) + (counts.AFP ?? 0) + (counts.ARL ?? 0) + (counts.CCF ?? 0);

  const cards: Card[] = [
    {
      href: '/admin/catalogos/entidades?tipo=EPS',
      label: 'Entidades SGSS',
      count: totalEntidades,
      icon: Database,
      desc: 'EPS · AFP · ARL · Caja de Compensación',
      sub: `${counts.EPS ?? 0} EPS · ${counts.AFP ?? 0} AFP · ${counts.ARL ?? 0} ARL · ${counts.CCF ?? 0} CCF`,
    },
    {
      href: '/admin/catalogos/actividades',
      label: 'Actividades (CIIU)',
      count: actividades,
      icon: Briefcase,
      desc: 'Códigos de actividad económica',
    },
    {
      href: '/admin/catalogos/tipos-cotizante',
      label: 'Tipos de cotizante',
      count: tipos,
      icon: UserCheck,
      desc: 'Con sus subtipos anidados',
      sub: subtipos > 0 ? `${subtipos} subtipos` : undefined,
    },
    {
      href: '/admin/catalogos/planes',
      label: 'Planes SGSS',
      count: planesCount,
      icon: Layers3,
      desc: 'Combinaciones EPS/AFP/ARL/CCF con régimen aplicable',
    },
    {
      href: '/admin/catalogos/tarifas',
      label: 'Tarifas SGSS',
      count: tarifasCount,
      icon: Percent,
      desc: 'Porcentajes EPS/AFP/ARL/CCF/SENA/ICBF + FSP',
      sub: fspCount > 0 ? `${fspCount} rangos FSP activos` : undefined,
    },
    {
      href: '/admin/catalogos/smlv',
      label: 'SMLV',
      count: smlvConfig ? 1 : 0,
      icon: DollarSign,
      desc: 'Salario mínimo legal vigente (actualiza toda la BD)',
      sub: smlvConfig ? copFmt.format(Number(smlvConfig.valor)) : 'Sin configurar',
    },
    {
      href: '/admin/catalogos/medios-pago',
      label: 'Medios de pago',
      count: medios,
      icon: CreditCard,
      desc: 'Formas de pago del cuadre de caja',
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Parametrización
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Datos maestros del sistema. Carga manual o importación desde Excel.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-brand"
            >
              <Icon className="h-6 w-6 text-slate-400 transition group-hover:text-brand-blue" />
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                {c.label}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
                {c.count}
              </p>
              <p className="mt-2 text-xs text-slate-500">{c.desc}</p>
              {c.sub && <p className="mt-1 text-[11px] text-slate-400">{c.sub}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
