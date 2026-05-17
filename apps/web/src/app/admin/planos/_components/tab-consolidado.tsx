import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { getUserScope } from '@/lib/sucursal-scope';
import { formatCOP, fullName } from '@/lib/format';
import { GenerarPlanillasButton } from '../generar-button';
import { DetallePlanillaButton } from '../detalle-button';
import { mesLabel } from '../_helpers';
import { StatBox, TipoBadge } from './badges';

/**
 * Tab "Consolidado" — preview de comprobantes pendientes agrupados en
 * planillas que se generarán al hacer click en `GenerarPlanillasButton`.
 *
 * Server Component. La page padre le pasa `periodoId` ya resuelto y, si
 * es staff, el filtro de sucursal.
 */
export async function TabConsolidado({
  periodoId,
  staffSucursalFilter,
}: {
  periodoId: string;
  staffSucursalFilter: string | null;
}) {
  // Scope: aliado sólo ve preview de sus comprobantes pendientes.
  // Staff puede filtrar explícitamente por sucursal.
  const scope = await getUserScope();
  const sucursalAplicada: string | null =
    scope?.tipo === 'SUCURSAL' ? scope.sucursalId : staffSucursalFilter;
  const compScopeOR: Prisma.ComprobanteWhereInput[] = sucursalAplicada
    ? [
        { cotizante: { sucursalId: sucursalAplicada } },
        { cuentaCobro: { sucursalId: sucursalAplicada } },
        {
          asesorComercial: {
            OR: [{ sucursalId: null }, { sucursalId: sucursalAplicada }],
          },
        },
      ]
    : [];

  // Traer todos los comprobantes pendientes con suficiente info para mostrar
  // el agrupamiento "preview" que se va a generar.
  const comps = await prisma.comprobante.findMany({
    where: {
      periodoId,
      procesadoEn: { not: null },
      estado: { not: 'ANULADO' },
      planillas: { none: {} },
      ...(compScopeOR.length > 0 ? { OR: compScopeOR } : {}),
    },
    include: {
      liquidaciones: {
        include: {
          liquidacion: {
            select: {
              periodoAporteAnio: true,
              periodoAporteMes: true,
              afiliacion: {
                select: {
                  modalidad: true,
                  empresa: { select: { id: true, nombre: true, nit: true } },
                  cotizante: {
                    select: {
                      id: true,
                      primerNombre: true,
                      primerApellido: true,
                      tipoDocumento: true,
                      numeroDocumento: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (comps.length === 0) {
    return (
      <Alert variant="info">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          No hay comprobantes pendientes de planilla en este período. Factura cotizantes en{' '}
          <Link href="/admin/transacciones" className="underline">
            Transacción
          </Link>{' '}
          y vuelve aquí cuando estén listos.
        </span>
      </Alert>
    );
  }

  // Preview de agrupación
  type Grupo = {
    key: string;
    tipo: 'E' | 'I';
    aportanteId: string;
    aportanteLabel: string;
    aportanteSub: string;
    periodoAporteAnio: number;
    periodoAporteMes: number;
    cotizantes: Set<string>;
    total: number;
    count: number;
  };

  const grupos = new Map<string, Grupo>();
  let sinAgrupar = 0;

  for (const comp of comps) {
    const primera = comp.liquidaciones[0]?.liquidacion;
    if (!primera) {
      sinAgrupar++;
      continue;
    }
    const af = primera.afiliacion;
    const paAnio = primera.periodoAporteAnio ?? new Date().getFullYear();
    const paMes = primera.periodoAporteMes ?? new Date().getMonth() + 1;

    let key: string;
    let tipo: 'E' | 'I';
    let aportanteId: string;
    let aportanteLabel: string;
    let aportanteSub: string;

    if (af.modalidad === 'DEPENDIENTE') {
      if (!af.empresa) {
        sinAgrupar++;
        continue;
      }
      key = `E|${af.empresa.id}|${paAnio}-${paMes}`;
      tipo = 'E';
      aportanteId = af.empresa.id;
      aportanteLabel = af.empresa.nombre;
      aportanteSub = af.empresa.nit ? `NIT ${af.empresa.nit}` : '';
    } else if (af.modalidad === 'INDEPENDIENTE') {
      const cot = af.cotizante;
      if (!cot) {
        sinAgrupar++;
        continue;
      }
      key = `I|${cot.id}|${paAnio}-${paMes}`;
      tipo = 'I';
      aportanteId = cot.id;
      aportanteLabel = fullName(cot);
      aportanteSub = `${cot.tipoDocumento} ${cot.numeroDocumento}`;
    } else {
      sinAgrupar++;
      continue;
    }

    let g = grupos.get(key);
    if (!g) {
      g = {
        key,
        tipo,
        aportanteId,
        aportanteLabel,
        aportanteSub,
        periodoAporteAnio: paAnio,
        periodoAporteMes: paMes,
        cotizantes: new Set(),
        total: 0,
        count: 0,
      };
      grupos.set(key, g);
    }
    g.count++;
    g.total += Number(comp.totalGeneral);
    for (const cl of comp.liquidaciones) {
      const cid = cl.liquidacion.afiliacion.cotizante?.id;
      if (cid) g.cotizantes.add(cid);
    }
  }

  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'E' ? -1 : 1;
    return a.aportanteLabel.localeCompare(b.aportanteLabel);
  });

  const totalGeneral = gruposOrdenados.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="Comprobantes"
          value={String(comps.length)}
          sub={sinAgrupar > 0 ? `${sinAgrupar} sin agrupar` : undefined}
        />
        <StatBox label="Planillas a generar" value={String(gruposOrdenados.length)} />
        <StatBox
          label="Tipo E"
          value={String(gruposOrdenados.filter((g) => g.tipo === 'E').length)}
          sub="Empresas"
        />
        <StatBox
          label="Tipo I"
          value={String(gruposOrdenados.filter((g) => g.tipo === 'I').length)}
          sub="Independientes"
        />
      </div>

      {/* Botón generar */}
      <GenerarPlanillasButton periodoId={periodoId} disabled={gruposOrdenados.length === 0} />

      {/* Tabla preview */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Preview de agrupación</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Al generar se crearán {gruposOrdenados.length} planillas. Los comprobantes quedarán
            enlazados y pasarán a la pestaña Guardado.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Aportante</th>
                <th className="px-4 py-2">Período aporte</th>
                <th className="px-4 py-2 text-right">Cotizantes</th>
                <th className="px-4 py-2 text-right">Comprobantes</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gruposOrdenados.map((g) => (
                <tr key={g.key}>
                  <td className="px-4 py-2.5">
                    <TipoBadge tipo={g.tipo} />
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{g.aportanteLabel}</p>
                    {g.aportanteSub && (
                      <p className="font-mono text-[10px] text-slate-500">{g.aportanteSub}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {mesLabel(g.periodoAporteAnio, g.periodoAporteMes)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{g.cotizantes.size}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{g.count}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                    {formatCOP(g.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DetallePlanillaButton
                      kind="grupo"
                      periodoId={periodoId}
                      tipo={g.tipo}
                      aportanteId={g.aportanteId}
                      periodoAporteAnio={g.periodoAporteAnio}
                      periodoAporteMes={g.periodoAporteMes}
                      tituloAportante={g.aportanteLabel}
                      tituloPeriodoAporte={mesLabel(g.periodoAporteAnio, g.periodoAporteMes)}
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium">
                <td
                  colSpan={5}
                  className="px-4 py-2.5 text-right text-xs uppercase tracking-wider text-slate-600"
                >
                  Total general
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-base font-bold text-brand-blue-dark">
                  {formatCOP(totalGeneral)}
                </td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
