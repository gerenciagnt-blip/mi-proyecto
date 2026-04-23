'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { tipo: 'EPS', label: 'EPS' },
  { tipo: 'AFP', label: 'AFP' },
  { tipo: 'ARL', label: 'ARL' },
  { tipo: 'CCF', label: 'Caja de Compensación' },
] as const;

export function EntidadTabs({ current }: { current: string }) {
  const params = useSearchParams();

  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = current === t.tipo;
        const search = new URLSearchParams(params?.toString() ?? '');
        search.set('tipo', t.tipo);
        return (
          <Link
            key={t.tipo}
            href={`/admin/catalogos/entidades?${search.toString()}`}
            className={cn(
              'relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition',
              active
                ? 'border-brand-blue text-brand-blue-dark'
                : 'border-transparent text-slate-500 hover:text-slate-900',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
