import Link from 'next/link';
import { prisma } from '@pila/db';

export const metadata = { title: 'Catálogos — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function CatalogosPage() {
  const [arls, actividades, tipos, subtipos] = await Promise.all([
    prisma.arl.count(),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
    prisma.subtipo.count(),
  ]);

  const cards = [
    { href: '/admin/catalogos/arl', label: 'ARLs', count: arls, desc: 'Administradoras de Riesgos Laborales' },
    { href: '/admin/catalogos/actividades', label: 'Actividades (CIIU)', count: actividades, desc: 'Códigos de actividad económica' },
    { href: '/admin/catalogos/tipos-cotizante', label: 'Tipos de cotizante', count: tipos, desc: 'Con sus subtipos anidados' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Catálogos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Datos maestros del sistema. Cada catálogo admite carga manual o importación desde Excel.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{c.count}</p>
            <p className="mt-2 text-xs text-slate-500">{c.desc}</p>
            {c.href.endsWith('tipos-cotizante') && subtipos > 0 && (
              <p className="mt-1 text-[11px] text-slate-400">{subtipos} subtipos</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
