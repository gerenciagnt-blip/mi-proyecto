import Link from 'next/link';
import { DollarSign, Landmark, FileSearch } from 'lucide-react';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';

export const metadata = { title: 'Finanzas · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function FinanzasHubPage() {
  await requireStaff();

  const [cobrosPendientes, cobrosVencidos, movimientosPendientes] = await Promise.all([
    prisma.cobroAliado.count({ where: { estado: 'PENDIENTE' } }),
    prisma.cobroAliado.count({ where: { estado: 'VENCIDO' } }),
    prisma.movimientoIncapacidad.count({ where: { estado: 'PENDIENTE' } }),
  ]);

  const cards = [
    {
      href: '/admin/soporte/finanzas/cobro-aliados',
      icon: DollarSign,
      title: 'Cobro Aliados',
      description: 'Cobros periódicos a los aliados por uso de la plataforma.',
      stat: cobrosPendientes,
      statLabel: 'pendientes',
      alert: cobrosVencidos > 0 ? `${cobrosVencidos} vencidos` : null,
    },
    {
      href: '/admin/soporte/finanzas/movimientos-incapacidades',
      icon: Landmark,
      title: 'Movimientos Incapacidades',
      description: 'Consignaciones de entidades SGSS por incapacidades.',
      stat: movimientosPendientes,
      statLabel: 'pendientes',
      alert: null,
    },
    {
      href: '/admin/soporte/finanzas/detalle-movimientos',
      icon: FileSearch,
      title: 'Detalle Movimientos',
      description: 'Desglose de pagos por cotizante (con retenciones).',
      stat: null,
      statLabel: null,
      alert: null,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Finanzas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobros, movimientos bancarios y detalle de pagos a cotizantes.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-blue/60 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <c.icon className="h-6 w-6 text-brand-blue" />
              {c.alert && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  {c.alert}
                </span>
              )}
            </div>
            <h2 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-brand-blue">
              {c.title}
            </h2>
            <p className="mt-1 flex-1 text-xs text-slate-500">{c.description}</p>
            {c.stat !== null && (
              <p className="mt-3 font-mono text-xl font-bold text-brand-blue-dark">
                {c.stat}
                <span className="ml-1 font-sans text-[10px] uppercase tracking-wider text-slate-500">
                  {c.statLabel}
                </span>
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
