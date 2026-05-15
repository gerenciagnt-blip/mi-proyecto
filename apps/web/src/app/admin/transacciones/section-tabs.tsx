'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRightLeft, Wallet, Calculator, History } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = {
  href: string;
  label: string;
  icon: typeof ArrowRightLeft;
  match: (p: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: '/admin/transacciones',
    label: 'Transacción',
    icon: ArrowRightLeft,
    match: (p) => p === '/admin/transacciones',
  },
  {
    href: '/admin/transacciones/historial',
    label: 'Historial',
    icon: History,
    match: (p) => p.startsWith('/admin/transacciones/historial'),
  },
  {
    href: '/admin/transacciones/cartera',
    label: 'Cartera de cotizantes',
    icon: Wallet,
    match: (p) => p.startsWith('/admin/transacciones/cartera'),
  },
  {
    href: '/admin/transacciones/cuadre',
    label: 'Cuadre de caja',
    icon: Calculator,
    match: (p) => p.startsWith('/admin/transacciones/cuadre'),
  },
];

export function SectionTabs({ esAsesor = false }: { esAsesor?: boolean }) {
  const pathname = usePathname() ?? '';
  // Sprint Asesor — el asesor solo ve Historial y Cartera de cotizantes.
  // Transacción (crear) y Cuadre de caja son del aliado dueño / staff.
  const tabsVisibles = esAsesor
    ? TABS.filter(
        (t) =>
          t.href === '/admin/transacciones/historial' || t.href === '/admin/transacciones/cartera',
      )
    : TABS;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-0">
      {tabsVisibles.map((t) => {
        const active = t.match(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px',
              active
                ? 'border-brand-blue text-brand-blue-dark'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
