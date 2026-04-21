import Link from 'next/link';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { prisma } from '@pila/db';

export const metadata = { title: 'Formato de comprobantes — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ComprobantesPage() {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { codigo: 'asc' },
    include: { comprobanteFormato: true },
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/catalogos"
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Catálogos</span>
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Formato de comprobantes de pago
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada Dueño Aliado puede tener su logo y encabezado personalizados en los comprobantes
          que emite desde Transacciones.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Nombre del formato</th>
              <th className="px-4 py-2">Logo</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sucursales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay sucursales
                </td>
              </tr>
            )}
            {sucursales.map((s) => {
              const f = s.comprobanteFormato;
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-slate-500">{s.codigo}</p>
                    <p className="text-sm">{s.nombre}</p>
                  </td>
                  <td className="px-4 py-3">{f?.nombre ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {f?.logoUrl ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Minus className="h-3.5 w-3.5" />
                        Sin logo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          f.active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {f.active ? 'Activo' : 'Inactivo'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin formato</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/catalogos/comprobantes/${s.id}`}
                      className="text-xs font-medium text-brand-blue hover:text-brand-blue-dark"
                    >
                      {f ? 'Editar' : 'Configurar'} →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
