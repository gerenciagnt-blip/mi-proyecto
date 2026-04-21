import Link from 'next/link';
import { Wallet, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { cerrarPeriodoAction, reabrirPeriodoAction } from '../actions';

export const metadata = { title: 'Cartera de cotizantes — Sistema PILA' };
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

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    include: {
      _count: { select: { liquidaciones: true, comprobantes: true } },
    },
  });

  const now = new Date();
  const periodo =
    (sp.periodoId && periodos.find((p) => p.id === sp.periodoId)) ||
    periodos.find((p) => p.anio === now.getFullYear() && p.mes === now.getMonth() + 1) ||
    periodos[0] ||
    null;

  // Comprobantes del período agrupados por estado
  const comprobantes = periodo
    ? await prisma.comprobante.findMany({
        where: { periodoId: periodo.id },
        include: {
          cotizante: true,
          cuentaCobro: { select: { codigo: true, razonSocial: true } },
          asesorComercial: { select: { codigo: true, nombre: true } },
        },
      })
    : [];

  // Totales globales del período
  const totales = comprobantes.reduce(
    (acc, c) => {
      const total = Number(c.totalGeneral);
      const pagado = Number(c.totalPagado);
      acc.emitido += total;
      acc.cobrado += pagado;
      if (c.estado !== 'ANULADO') acc.pendiente += total - pagado;
      return acc;
    },
    { emitido: 0, cobrado: 0, pendiente: 0 },
  );

  // Sólo filas de cobro (excluye reportes por asesor) pendientes
  const pendientes = comprobantes
    .filter(
      (c) =>
        c.agrupacion !== 'ASESOR_COMERCIAL' &&
        c.estado !== 'PAGADO' &&
        c.estado !== 'ANULADO',
    )
    .map((c) => {
      let destinatario = '—';
      let sub: string | undefined;
      if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
        destinatario = fullName(c.cotizante);
        sub = `${c.cotizante.tipoDocumento} ${c.cotizante.numeroDocumento}`;
      } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
        destinatario = c.cuentaCobro.razonSocial;
        sub = c.cuentaCobro.codigo;
      }
      const total = Number(c.totalGeneral);
      const pagado = Number(c.totalPagado);
      return {
        id: c.id,
        consecutivo: c.consecutivo,
        tipo: c.tipo,
        destinatario,
        sub,
        total,
        pagado,
        saldo: total - pagado,
        estado: c.estado,
      };
    });

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Wallet className="h-6 w-6 text-brand-blue" />
            Cartera de cotizantes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Saldos pendientes, totales del período y cierre contable.
          </p>
        </div>
      </header>

      {!periodo ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">
            Aún no hay períodos — abre el primero desde{' '}
            <Link href="/admin/transacciones" className="underline">
              Transacción
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/* Selector de período + cierre */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Período
                  </span>
                  {periodos.map((p) => {
                    const active = p.id === periodo.id;
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/transacciones/cartera?periodoId=${p.id}`}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition',
                          active
                            ? 'bg-brand-blue/10 text-brand-blue-dark'
                            : 'text-slate-600 hover:bg-slate-100',
                        )}
                      >
                        {p.anio}-{String(p.mes).padStart(2, '0')}
                        {p.estado === 'CERRADO' && (
                          <Lock className="h-3 w-3 text-slate-400" />
                        )}
                      </Link>
                    );
                  })}
                </div>

                {/* Botón cierre/reapertura — movido desde Transacción */}
                {periodo.estado === 'ABIERTO' ? (
                  <form action={cerrarPeriodoAction.bind(null, periodo.id)}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Cerrar período
                    </button>
                  </form>
                ) : (
                  <form action={reabrirPeriodoAction.bind(null, periodo.id)}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Reabrir período
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {MESES[periodo.mes - 1]} {periodo.anio} ·{' '}
                {periodo.estado === 'CERRADO' ? (
                  <span className="text-slate-400">
                    Cerrado {periodo.cerradoEn?.toLocaleDateString('es-CO')}
                  </span>
                ) : (
                  'Abierto'
                )}{' '}
                · {periodo._count.comprobantes} comprobantes
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 divide-x divide-slate-100 sm:grid-cols-3">
              <Stat label="Total emitido" value={copFmt.format(totales.emitido)} tone="slate" />
              <Stat label="Total cobrado" value={copFmt.format(totales.cobrado)} tone="emerald" />
              <Stat
                label="Cartera pendiente"
                value={copFmt.format(totales.pendiente)}
                tone="amber"
              />
            </div>
          </section>

          {/* Pendientes */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h2 className="font-heading text-base font-semibold text-slate-900">
                Comprobantes con saldo pendiente
              </h2>
              <span className="text-xs text-slate-500">
                {pendientes.length}{' '}
                {pendientes.length === 1 ? 'registro' : 'registros'}
              </span>
            </header>

            {pendientes.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-400">
                {comprobantes.length === 0
                  ? 'Sin comprobantes generados todavía.'
                  : 'Toda la cartera del período está al día.'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2">Consecutivo</th>
                    <th className="px-5 py-2">Destinatario</th>
                    <th className="px-5 py-2">Tipo</th>
                    <th className="px-5 py-2 text-right">Total</th>
                    <th className="px-5 py-2 text-right">Pagado</th>
                    <th className="px-5 py-2 text-right">Saldo</th>
                    <th className="px-5 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendientes.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-2.5 font-mono text-xs font-medium">
                        {p.consecutivo}
                      </td>
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{p.destinatario}</p>
                        {p.sub && (
                          <p className="font-mono text-[11px] text-slate-500">{p.sub}</p>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        {p.tipo === 'AFILIACION' ? 'Vinculación' : 'Mensualidad'}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs">
                        {copFmt.format(p.total)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-xs text-emerald-700">
                        {copFmt.format(p.pagado)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-sm font-semibold text-amber-700">
                        {copFmt.format(p.saldo)}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            p.estado === 'BORRADOR'
                              ? 'bg-slate-100 text-slate-600 ring-slate-200'
                              : 'bg-sky-50 text-sky-700 ring-sky-200',
                          )}
                        >
                          {p.estado === 'BORRADOR' ? 'Borrador' : 'Emitido'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {periodo.estado === 'ABIERTO' && totales.pendiente > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>
                <strong>Atención al cerrar:</strong> el período aún tiene cartera pendiente
                ({copFmt.format(totales.pendiente)}). Al cerrar se bloquean recálculos pero
                podrás registrar pagos desde la sección de comprobantes hasta que todo quede
                en estado Pagado.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber';
}) {
  const toneCls = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }[tone];
  return (
    <div className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-bold tracking-tight', toneCls)}>
        {value}
      </p>
    </div>
  );
}
