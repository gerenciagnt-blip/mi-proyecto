import Link from 'next/link';
import { Briefcase, Wallet, HeartPulse, ArrowRight } from 'lucide-react';

export const metadata = { title: 'Administrativo — Sistema PILA' };

export default function AdministrativoPage() {
  const items = [
    {
      href: '/admin/administrativo/cartera',
      icon: Wallet,
      label: 'Cartera',
      description: 'Líneas de cartera real confirmadas por Soporte para tu sucursal.',
      tone: 'text-violet-700 bg-violet-50',
    },
    {
      href: '/admin/administrativo/incapacidades',
      icon: HeartPulse,
      label: 'Incapacidades',
      description: 'Radica una incapacidad y consulta el histórico de estados.',
      tone: 'text-emerald-700 bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Briefcase className="h-6 w-6 text-brand-blue" />
          Administrativo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Gestiona desde tu sucursal lo que Soporte confirma sobre cartera SGSS
          e incapacidades.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-brand"
          >
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${it.tone}`}>
              <it.icon className="h-5 w-5" />
            </div>
            <h2 className="mt-3 font-heading text-lg font-semibold text-slate-900">
              {it.label}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{it.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-blue transition group-hover:gap-2">
              Abrir <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
