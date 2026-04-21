import Link from 'next/link';
import {
  Briefcase,
  UserCheck,
  Database,
  Users2,
  CreditCard,
  Sparkles,
  FileSignature,
  DollarSign,
  Layers3,
  Percent,
  type LucideIcon,
} from 'lucide-react';
import { prisma } from '@pila/db';

export const metadata = { title: 'Catálogos — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Card = {
  href: string;
  label: string;
  count: number;
  icon: LucideIcon;
  desc: string;
  sub?: string;
};

export default async function CatalogosPage() {
  const [
    entidadesPorTipo,
    actividades,
    tipos,
    subtipos,
    asesores,
    medios,
    servicios,
    comprobantes,
    sucursalesCount,
  ] = await Promise.all([
    prisma.entidadSgss.groupBy({ by: ['tipo'], _count: true }),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
    prisma.subtipo.count(),
    prisma.asesorComercial.count(),
    prisma.medioPago.count(),
    prisma.servicioAdicional.count(),
    prisma.comprobanteFormato.count({ where: { active: true } }),
    prisma.sucursal.count(),
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
      href: '/admin/catalogos/asesores',
      label: 'Asesores comerciales',
      count: asesores,
      icon: Users2,
      desc: 'Se anclan al cotizante al crearlo',
    },
    {
      href: '/admin/catalogos/medios-pago',
      label: 'Medios de pago',
      count: medios,
      icon: CreditCard,
      desc: 'Formas de pago del cuadre de caja',
    },
    {
      href: '/admin/catalogos/servicios',
      label: 'Servicios adicionales',
      count: servicios,
      icon: Sparkles,
      desc: 'Cobros extra sobre el servicio base',
    },
    {
      href: '/admin/catalogos/comprobantes',
      label: 'Formato comprobantes',
      count: comprobantes,
      icon: FileSignature,
      desc: 'Logo y plantilla personalizados por aliado',
      sub: `${comprobantes}/${sucursalesCount} sucursales configuradas`,
    },
    {
      href: '/admin/catalogos/planes',
      label: 'Planes SGSS',
      count: planesCount,
      icon: Layers3,
      desc: 'Combinaciones EPS/AFP/ARL/CCF que definen un plan',
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
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Catálogos
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
