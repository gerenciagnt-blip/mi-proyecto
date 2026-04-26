import Link from 'next/link';
import { AlertTriangle, Building, ChevronRight, Wallet } from 'lucide-react';
import type { AlertasInactividad } from '@/lib/alertas/inactividad';

const formatoCop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function formatoFecha(d: Date | null): string {
  if (!d) return 'Sin registros';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Sección visual del dashboard ejecutivo con dos listas:
 *   - Cartera activa sin gestión hace +N días (default 30).
 *   - Empresas planilla activas que no han pagado en +N días (default 60).
 *
 * Muestra solo top-10 de cada categoría. Cada item linkea al detalle
 * para que el usuario actúe sin tener que buscar.
 *
 * Si ambas listas están vacías → no se renderiza la sección (no
 * mostrar "0 alertas" porque es ruido visual cuando todo va bien).
 */
export function AlertasInactividadSection({
  alertas,
  hrefBaseCartera,
  hrefBaseEmpresa,
}: {
  alertas: AlertasInactividad;
  /** Ruta base para drill-down de cartera (varía por scope). */
  hrefBaseCartera: string;
  /** Ruta base para drill-down de empresa. */
  hrefBaseEmpresa: string;
}) {
  const totalAlertas = alertas.cartera.length + alertas.empresasSinPlanilla.length;
  if (totalAlertas === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        Alertas de inactividad
      </h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Cartera */}
        {alertas.cartera.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <Wallet className="h-3.5 w-3.5" />
                Cartera sin gestión hace +30 días
              </h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                {alertas.totales.cartera > alertas.cartera.length
                  ? `${alertas.cartera.length} de ${alertas.totales.cartera}`
                  : alertas.cartera.length}
              </span>
            </header>
            <ul className="divide-y divide-amber-100">
              {alertas.cartera.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${hrefBaseCartera}/${c.id}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-xs hover:bg-amber-100/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{c.nombreCompleto}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        {c.numeroDocumento} · {c.periodoCobro} · {formatoCop.format(c.valor)}
                        {c.sucursalCodigo && ` · ${c.sucursalCodigo}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-200/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                      {c.diasSinGestion}d
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-amber-500" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empresas sin planilla */}
        {alertas.empresasSinPlanilla.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-rose-900">
                <Building className="h-3.5 w-3.5" />
                Empresas sin planilla hace +60 días
              </h3>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
                {alertas.totales.empresasSinPlanilla > alertas.empresasSinPlanilla.length
                  ? `${alertas.empresasSinPlanilla.length} de ${alertas.totales.empresasSinPlanilla}`
                  : alertas.empresasSinPlanilla.length}
              </span>
            </header>
            <ul className="divide-y divide-rose-100">
              {alertas.empresasSinPlanilla.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`${hrefBaseEmpresa}/${e.id}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-xs hover:bg-rose-100/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{e.nombre}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        NIT {e.nit} · {e.afiliacionesActivas} afiliaciones · última pagada{' '}
                        {formatoFecha(e.ultimaPlanillaPagadaEn)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-200/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-900">
                      {e.diasSinPlanilla}d
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-rose-500" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
