import Link from 'next/link';
import { ArrowRightLeft, FileStack, Lock, Unlock } from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { AbrirPeriodoDialog } from './abrir-periodo-dialog';
import { LiquidarButton } from './liquidar-button';
import {
  LiquidacionesTable,
  type LiquidacionRow,
} from './liquidaciones-table';
import { cerrarPeriodoAction, reabrirPeriodoAction } from './actions';

export const metadata = { title: 'Transacciones — Sistema PILA' };
export const dynamic = 'force-dynamic';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type SP = { periodoId?: string };

function fullName(c: {
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
}) {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  let periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    include: { _count: { select: { liquidaciones: true } } },
  });

  // Auto-apertura del período del mes en curso si no existe y hay SMLV
  // configurado. Esto materializa la regla "período = AAAA-MM actual".
  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();
  const existeActual = periodos.some(
    (p) => p.anio === anioActual && p.mes === mesActual,
  );
  if (!existeActual) {
    const smlv = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
    if (smlv) {
      await prisma.periodoContable.create({
        data: { anio: anioActual, mes: mesActual, smlvSnapshot: smlv.valor },
      });
      periodos = await prisma.periodoContable.findMany({
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        include: { _count: { select: { liquidaciones: true } } },
      });
    }
  }

  // Período seleccionado:
  //   1. el del query param, o
  //   2. el del mes en curso, o
  //   3. el más reciente abierto, o
  //   4. el primero disponible.
  const periodoActual =
    (sp.periodoId && periodos.find((p) => p.id === sp.periodoId)) ||
    periodos.find((p) => p.anio === anioActual && p.mes === mesActual) ||
    periodos.find((p) => p.estado === 'ABIERTO') ||
    periodos[0] ||
    null;

  const liquidacionesRaw = periodoActual
    ? await prisma.liquidacion.findMany({
        where: { periodoId: periodoActual.id },
        // VINCULACION primero (usar desc porque 'V' > 'M' alfabéticamente)
        // para que el admin revise los ingresos nuevos antes de aprobar
        // el lote; dentro de cada tipo, por apellido del cotizante.
        orderBy: [
          { tipo: 'desc' },
          { afiliacion: { cotizante: { primerApellido: 'asc' } } },
        ],
        include: {
          conceptos: { orderBy: { concepto: 'asc' } },
          afiliacion: {
            include: {
              cotizante: true,
              empresa: { select: { nombre: true } },
            },
          },
        },
      })
    : [];

  // Stats agregadas
  const totales = liquidacionesRaw.reduce(
    (acc, l) => {
      acc.general += Number(l.totalGeneral);
      acc.empleador += Number(l.totalEmpleador);
      acc.trabajador += Number(l.totalTrabajador);
      return acc;
    },
    { general: 0, empleador: 0, trabajador: 0 },
  );

  const porConcepto = new Map<string, number>();
  for (const l of liquidacionesRaw) {
    for (const c of l.conceptos) {
      porConcepto.set(c.concepto, (porConcepto.get(c.concepto) ?? 0) + Number(c.valor));
    }
  }

  const rows: LiquidacionRow[] = liquidacionesRaw.map((l) => ({
    id: l.id,
    afiliacionId: l.afiliacionId,
    tipo: l.tipo,
    estado: l.estado,
    ibc: Number(l.ibc),
    diasCotizados: l.diasCotizados,
    diaDesde: l.diaDesde,
    diaHasta: l.diaHasta,
    totalEmpleador: Number(l.totalEmpleador),
    totalTrabajador: Number(l.totalTrabajador),
    totalGeneral: Number(l.totalGeneral),
    calculadoEn: l.calculadoEn.toISOString(),
    cotizante: {
      tipoDocumento: l.afiliacion.cotizante.tipoDocumento,
      numeroDocumento: l.afiliacion.cotizante.numeroDocumento,
      nombreCompleto: fullName(l.afiliacion.cotizante),
    },
    empresa: l.afiliacion.empresa,
    modalidad: l.afiliacion.modalidad,
    nivelRiesgo: l.afiliacion.nivelRiesgo,
    conceptos: l.conceptos.map((c) => ({
      id: c.id,
      concepto: c.concepto,
      subconcepto: c.subconcepto,
      base: Number(c.base),
      porcentaje: Number(c.porcentaje),
      valor: Number(c.valor),
      aCargoEmpleador: c.aCargoEmpleador,
      observaciones: c.observaciones,
    })),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <ArrowRightLeft className="h-6 w-6 text-brand-blue" />
            Transacciones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Liquidación mensual de afiliaciones según tarifas SGSS vigentes.
          </p>
        </div>
        <AbrirPeriodoDialog />
      </header>

      {periodos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">
            Aún no hay períodos contables — abre el primero con el botón de arriba.
          </p>
        </div>
      ) : (
        <>
          {/* Selector de período */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Período
                  </span>
                  {periodos.map((p) => {
                    const active = p.id === periodoActual?.id;
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/transacciones?periodoId=${p.id}`}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition',
                          active
                            ? 'bg-brand-blue/10 text-brand-blue-dark'
                            : 'text-slate-600 hover:bg-slate-100',
                        )}
                      >
                        <span>
                          {p.anio}-{String(p.mes).padStart(2, '0')}
                        </span>
                        <span className="font-normal text-slate-400">
                          ({p._count.liquidaciones})
                        </span>
                        {p.estado === 'CERRADO' && (
                          <Lock className="h-3 w-3 text-slate-400" />
                        )}
                      </Link>
                    );
                  })}
                </div>

                {periodoActual && (
                  <div className="flex items-center gap-2">
                    <LiquidarButton
                      periodoId={periodoActual.id}
                      disabled={periodoActual.estado === 'CERRADO'}
                    />
                    <Link
                      href={`/admin/transacciones/comprobantes?periodoId=${periodoActual.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FileStack className="h-3 w-3" />
                      Comprobantes
                    </Link>
                    {periodoActual.estado === 'ABIERTO' ? (
                      <form action={cerrarPeriodoAction.bind(null, periodoActual.id)}>
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Lock className="h-3 w-3" />
                          Cerrar período
                        </button>
                      </form>
                    ) : (
                      <form action={reabrirPeriodoAction.bind(null, periodoActual.id)}>
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Unlock className="h-3 w-3" />
                          Reabrir período
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {periodoActual && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {MESES[periodoActual.mes - 1]} {periodoActual.anio} · SMLV de referencia{' '}
                  <span className="font-mono font-medium">
                    {copFmt.format(Number(periodoActual.smlvSnapshot))}
                  </span>{' '}
                  · {periodoActual.estado === 'CERRADO' ? 'Cerrado' : 'Abierto'}
                </p>
              )}
            </div>

            {/* Stats */}
            {periodoActual && rows.length > 0 && (
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
                <Stat label="Afiliaciones" value={String(rows.length)} mono={false} />
                <Stat label="Total empleador" value={copFmt.format(totales.empleador)} />
                <Stat label="Total trabajador" value={copFmt.format(totales.trabajador)} />
                <Stat label="Total período" value={copFmt.format(totales.general)} highlight />
              </div>
            )}

            {/* Desglose por concepto */}
            {periodoActual && porConcepto.size > 0 && (
              <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Subtotales por concepto
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(porConcepto.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([concepto, valor]) => (
                      <div
                        key={concepto}
                        className="rounded-md bg-white px-3 py-1.5 text-xs ring-1 ring-inset ring-slate-200"
                      >
                        <span className="font-medium text-slate-700">{concepto}</span>
                        <span className="ml-2 font-mono text-slate-600">
                          {copFmt.format(valor)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>

          {/* Tabla de liquidaciones */}
          {periodoActual && (
            <LiquidacionesTable
              rows={rows}
              periodoCerrado={periodoActual.estado === 'CERRADO'}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  mono = true,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-bold tracking-tight',
          mono && 'font-mono',
          highlight ? 'text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}
