import Link from 'next/link';
import { prisma } from '@pila/db';

export const metadata = { title: 'Administración — Sistema PILA' };

export default async function AdminHomePage() {
  const [sucursales, empresas, usuarios] = await Promise.all([
    prisma.sucursal.count(),
    prisma.empresa.count(),
    prisma.user.count(),
  ]);

  const cards = [
    { href: '/admin/sucursales', label: 'Sucursales', value: sucursales },
    { href: '/admin/empresas', label: 'Empresas', value: empresas },
    { href: '/admin/usuarios', label: 'Usuarios', value: usuarios },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
        <p className="mt-1 text-sm text-slate-500">Resumen del sistema</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{c.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
