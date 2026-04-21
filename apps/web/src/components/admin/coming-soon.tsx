import Link from 'next/link';
import { Hammer, ArrowLeft, type LucideIcon } from 'lucide-react';

export function ComingSoon({
  title,
  description,
  icon: Icon = Hammer,
  backHref = '/admin',
  backLabel = 'Panel',
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{backLabel}</span>
      </Link>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10">
          <Icon className="h-6 w-6 text-brand-blue" />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {description ?? 'Este módulo está en construcción.'}
        </p>
        <p className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          En construcción
        </p>
      </section>
    </div>
  );
}
