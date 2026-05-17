import { AlertCircle, Download } from 'lucide-react';
import type { EstadoPlanilla, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getUserScope } from '@/lib/sucursal-scope';
import { formatCOP, fullName } from '@/lib/format';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';
import { AnularPlanillaButton } from '../anular-button';
import { PagosimpleCell } from '../pagosimple-cell';
import { DetallePlanillaButton } from '../detalle-button';
import { VerErroresButton } from '../ver-errores-button';
import { mesLabel } from '../_helpers';
import { TipoBadge, EstadoBadge } from './badges';

/**
 * Tabla principal de planillas — la consumen los tabs Guardado,
 * Validación y Pagadas. Cambia las acciones por fila según `estado` y
 * `pagosimpleFilter`.
 *
 * Server Component. Lee el scope del usuario para filtrar por sucursal.
 */
export async function PlanillasTable({
  periodoId,
  estado,
  showPeriodo = false,
  staffSucursalFilter,
  pagosimpleFilter,
}: {
  periodoId?: string;
  estado: EstadoPlanilla;
  showPeriodo?: boolean;
  staffSucursalFilter: string | null;
  /** Filtro adicional sobre el resultado de validación PagoSimple:
   *   - 'sin_error': null / 'OK' / 'PENDIENTE' (lo "limpio")
   *   - 'con_error': cualquier valor distinto = la planilla quedó con
   *     errores tras la validación del operador y necesita atención. */
  pagosimpleFilter?: 'sin_error' | 'con_error';
}) {
  // Scope: aliado sólo ve sus propias planillas.
  // Staff puede filtrar explícitamente por sucursal.
  const scope = await getUserScope();
  const esStaff = scope?.tipo === 'STAFF';
  const sucursalAplicada: string | null =
    scope?.tipo === 'SUCURSAL' ? scope.sucursalId : staffSucursalFilter;
  const planillaScope = sucursalAplicada ? { sucursalId: sucursalAplicada } : {};

  // Filtro PagoSimple:
  //   'sin_error'  = ya pasó OK: tiene pagosimpleNumero Y estado limpio.
  //   'con_error'  = requiere atención: NO tiene número (falló envío) o
  //                  el operador devolvió error de validación.
  const psWhere: Prisma.PlanillaWhereInput =
    pagosimpleFilter === 'con_error'
      ? {
          OR: [
            { pagosimpleNumero: null },
            {
              pagosimpleEstadoValidacion: { not: null },
              NOT: [
                { pagosimpleEstadoValidacion: 'OK' },
                { pagosimpleEstadoValidacion: 'PENDIENTE' },
              ],
            },
          ],
        }
      : pagosimpleFilter === 'sin_error'
        ? {
            pagosimpleNumero: { not: null },
            OR: [
              { pagosimpleEstadoValidacion: null },
              { pagosimpleEstadoValidacion: 'OK' },
              { pagosimpleEstadoValidacion: 'PENDIENTE' },
            ],
          }
        : {};

  const planillas = await prisma.planilla.findMany({
    where: {
      ...(periodoId ? { periodoId } : {}),
      estado,
      ...planillaScope,
      ...psWhere,
    },
    orderBy: [{ generadoEn: 'desc' }],
    include: {
      periodo: { select: { anio: true, mes: true } },
      empresa: { select: { nombre: true, nit: true } },
      cotizante: {
        select: {
          primerNombre: true,
          primerApellido: true,
          tipoDocumento: true,
          numeroDocumento: true,
        },
      },
      _count: { select: { comprobantes: true } },
    },
  });

  const psEnabled = isPagosimpleEnabled();

  if (planillas.length === 0) {
    return (
      <Alert variant="info">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {estado === 'CONSOLIDADO'
            ? 'No hay planillas guardadas en este período. Genera desde el tab Consolidado.'
            : 'No hay planillas pagadas en el historial.'}
        </span>
      </Alert>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Consecutivo</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Aportante</th>
              <th className="px-4 py-2">Período</th>
              {showPeriodo && <th className="px-4 py-2">Contable</th>}
              <th className="px-4 py-2 text-right">Cotizantes</th>
              <th className="px-4 py-2">N° planilla</th>
              <th className="px-4 py-2 text-right">Mora</th>
              <th className="px-4 py-2 text-right">SGSS</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {planillas.map((p) => {
              let aportanteLabel = '—';
              let aportanteSub = '';
              if (p.empresa) {
                aportanteLabel = p.empresa.nombre;
                aportanteSub = p.empresa.nit ? `NIT ${p.empresa.nit}` : '';
              } else if (p.cotizante) {
                aportanteLabel = fullName(p.cotizante);
                aportanteSub = `${p.cotizante.tipoDocumento} ${p.cotizante.numeroDocumento}`;
              }
              // Valores que se muestran: si PagoSimple ya devolvió totales,
              // los usamos (incluyen mora). Si no, fallback a los locales
              // (mora=0 hasta que PagoSimple los calcule).
              const valSgss = p.pagosimpleTotalSgss
                ? Number(p.pagosimpleTotalSgss)
                : Number(p.totalGeneral);
              const valMora = p.pagosimpleTotalMora ? Number(p.pagosimpleTotalMora) : 0;
              const valTotal = p.pagosimpleTotalPagar
                ? Number(p.pagosimpleTotalPagar)
                : Number(p.totalGeneral);
              const numeroExt = p.pagosimpleNumero ?? p.numeroPlanillaExt ?? null;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{p.consecutivo}</td>
                  <td className="px-4 py-2.5">
                    <TipoBadge tipo={p.tipoPlanilla} />
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{aportanteLabel}</p>
                    {aportanteSub && (
                      <p className="font-mono text-[10px] text-slate-500">{aportanteSub}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {mesLabel(p.periodoAporteAnio, p.periodoAporteMes)}
                  </td>
                  {showPeriodo && (
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {mesLabel(p.periodo.anio, p.periodo.mes)}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {p.cantidadCotizantes}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {numeroExt ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right font-mono text-xs',
                      valMora > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400',
                    )}
                  >
                    {formatCOP(valMora)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCOP(valSgss)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                    {formatCOP(valTotal)}
                  </td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={p.estado} />
                    {psEnabled && p.pagosimpleEstadoValidacion && (
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        PS: {p.pagosimpleEstadoValidacion}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <DetallePlanillaButton
                        kind="planilla"
                        planillaId={p.id}
                        tituloAportante={aportanteLabel}
                        tituloPeriodoAporte={mesLabel(p.periodoAporteAnio, p.periodoAporteMes)}
                      />
                      {/* Sprint Validación Planos (2026-05-17) — el botón
                          "Ver errores" reemplaza al módulo paralelo
                          /admin/soporte/planillas-errores. Solo tiene
                          sentido cuando la planilla tiene un número de
                          PagoSimple (si nunca se envió, no hay nada que
                          consultar) Y el operador devolvió ERROR de
                          validación. */}
                      {psEnabled &&
                        pagosimpleFilter === 'con_error' &&
                        p.pagosimpleNumero &&
                        p.pagosimpleEstadoValidacion === 'ERROR' && (
                          <VerErroresButton
                            planillaId={p.id}
                            consecutivo={p.consecutivo}
                            aportante={
                              aportanteSub ? `${aportanteLabel} · ${aportanteSub}` : aportanteLabel
                            }
                          />
                        )}
                      {psEnabled && estado === 'CONSOLIDADO' && (
                        <PagosimpleCell
                          planillaId={p.id}
                          consecutivo={p.consecutivo}
                          pagosimpleNumero={p.pagosimpleNumero}
                          pagosimpleEstadoValidacion={p.pagosimpleEstadoValidacion}
                          pagosimplePaymentUrl={p.pagosimplePaymentUrl}
                        />
                      )}
                      {/* La descarga del TXT es solo para staff (ADMIN/SOPORTE).
                          Los aliados no operan el plano directamente. */}
                      {esStaff && (
                        <a
                          href={`/api/planos/${p.id}/plano.txt`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                          title="Descargar archivo plano"
                        >
                          <Download className="h-3.5 w-3.5" />
                          TXT
                        </a>
                      )}
                      {/* "Marcar pagada" se eliminó del UI: el estado lo
                          actualiza el sync automático con PagoSimple cada
                          15 minutos en horario laboral. */}
                      {estado === 'CONSOLIDADO' && esStaff && (
                        <AnularPlanillaButton planillaId={p.id} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
