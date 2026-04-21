import Link from 'next/link';
import { Building2, Briefcase, Users, Database, ArrowRight } from 'lucide-react';
import { prisma } from '@pila/db';

export const metadata = { title: 'Administración — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const [sucursales, empresas, usuarios, arls, actividades, tiposCot] = await Promise.all([
    prisma.sucursal.count(),
    prisma.empresa.count(),
    prisma.user.count(),
    prisma.arl.count(),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
  ]);

  const cards = [
    {
      href: '/admin/sucursales',
      label: 'Sucursales',
      count: sucursales,
      icon: Building2,
      accent: 'from-brand-blue to-brand-turquoise',
    },
    {
      href: '/admin/empresas',
      label: 'Empresas',
      count: empresas,
      icon: Briefcase,
      accent: 'from-brand-blue to-brand-green',
    },
    {
      href: '/admin/usuarios',
      label: 'Usuarios',
      count: usuarios,
      icon: Users,
      accent: 'from-brand-green to-brand-turquoise',
    },
    {
      href: '/admin/catalogos',
      label: 'Catálogos',
      count: arls + actividades + tiposCot,
      icon: Database,
      accent: 'from-brand-turquoise to-brand-blue',
      sub: `${arls} ARL · ${actividades} CIIU · ${tiposCot} tipos cotizante`,
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Visión general del sistema. Da clic en cualquier sección para administrarla.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-brand"
            >
              {/* accent */}
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.accent}`}
                aria-hidden
              />

              <div className="flex items-start justify-between">
                <Icon className="h-6 w-6 text-slate-400 transition group-hover:text-brand-blue" />
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-blue" />
              </div>

              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                {c.label}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
                {c.count}
              </p>
              {c.sub && <p className="mt-1 text-[11px] text-slate-500">{c.sub}</p>}
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Próximos pasos
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>• Cargar los catálogos base (ARL, CIIU, tipos cotizante) antes de crear empresas</li>
          <li>• Crear sucursales y sus usuarios aliados</li>
          <li>• Configurar la pestaña PILA de cada empresa (niveles, actividades, cotizantes permitidos)</li>
        </ul>
      </section>
    </div>
  );
}
