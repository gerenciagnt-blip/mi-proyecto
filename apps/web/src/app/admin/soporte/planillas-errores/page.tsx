import Link from 'next/link';
import { AlertCircle, FileWarning, Clock } from 'lucide-react';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { formatCOP } from '@/lib/format';
import { VerErroresButton } from './ver-errores-button';

export const metadata = { title: 'Planillas con errores PagoSimple — Sistema PILA' };
export const dynamic = 'force-dynamic';

function fmtFecha(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sprint PagoSimple Errores — bandeja staff para revisar planillas que
 * fallaron la validación contra el operador. La page solo muestra la
 * lista con datos locales; las inconsistencias específicas se traen en
 * vivo desde el operador al pulsar "Ver errores" (modal).
 *
 * Diseño:
 *   - Filtra `pagosimpleEstadoValidacion = 'ERROR'`.
 *   - Ordena por última sync desc (las más recientes arriba).
 *   - Tope 200 — si hay más, paginamos en una siguiente iteración.
 *   - Las inconsistencias NO se cachean acá; cada click hace fetch al
 *     operador para garantizar info fresca (lo que el aliado ya corrigió
 *     localmente puede haber bajado el count del operador).
 */
export default async function PlanillasErroresPage() {
  await requirePermiso('soporte.planillas_errores');

  const planillas = await prisma.planilla.findMany({
    where: { pagosimpleEstadoValidacion: 'ERROR' },
    orderBy: [{ pagosimpleSyncedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      empresa: { select: { nit: true, nombre: true } },
      cotizante: {
        select: {
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          primerApellido: true,
        },
      },
      sucursal: { select: { codigo: true, nombre: true } },
      periodo: { select: { anio: true, mes: true } },
    },
  });

  const totalEnError = planillas.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <FileWarning className="h-6 w-6 text-amber-600" />
          Planillas con errores PagoSimple
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Planillas cuya validación contra el operador devolvió{' '}
          <span className="font-mono text-amber-700">ERROR</span>. Cada fila tiene un botón para ver
          el detalle de las inconsistencias (consulta en vivo al operador).
        </p>
      </header>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="flex items-center gap-2 text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{totalEnError}</strong>{' '}
            {totalEnError === 1 ? 'planilla está' : 'planillas están'} en estado ERROR.
          </span>
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Consecutivo</th>
              <th className="px-4 py-2">Aportante</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Período</th>
              <th className="px-4 py-2 text-right">Total a pagar</th>
              <th className="px-4 py-2">
                <Clock className="inline h-3 w-3" /> Última sync
              </th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {planillas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No hay planillas con errores. 🎉
                </td>
              </tr>
            )}
            {planillas.map((p) => {
              const aportante = p.empresa
                ? `${p.empresa.nit} · ${p.empresa.nombre}`
                : p.cotizante
                  ? `${p.cotizante.tipoDocumento} ${p.cotizante.numeroDocumento} · ${p.cotizante.primerNombre} ${p.cotizante.primerApellido}`
                  : '—';
              return (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-600">
                    {p.consecutivo}
                    {p.pagosimpleNumero && (
                      <p className="text-[10px] text-slate-400">PS #{p.pagosimpleNumero}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">{aportante}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                    {p.sucursal?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                    {p.periodo
                      ? `${p.periodo.anio}-${String(p.periodo.mes).padStart(2, '0')}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {p.pagosimpleTotalPagar ? formatCOP(Number(p.pagosimpleTotalPagar)) : '—'}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">
                    {fmtFecha(p.pagosimpleSyncedAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <VerErroresButton
                        planillaId={p.id}
                        consecutivo={p.consecutivo}
                        aportante={aportante}
                      />
                      <Link
                        href={`/admin/planos?planilla=${p.id}`}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        title="Abrir esta planilla en Planos"
                      >
                        Abrir →
                      </Link>
                    </div>
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
