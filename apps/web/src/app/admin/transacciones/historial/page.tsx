import Link from 'next/link';
import { History, Search } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Historial de transacciones — Sistema PILA' };
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

type SP = {
  periodoId?: string;
  tipo?: string;
  agrupacion?: string;
  q?: string;
};

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

function buildHref(patch: Partial<SP>, current: SP) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  if (merged.periodoId) params.set('periodoId', merged.periodoId);
  if (merged.tipo) params.set('tipo', merged.tipo);
  if (merged.agrupacion) params.set('agrupacion', merged.agrupacion);
  if (merged.q) params.set('q', merged.q);
  const s = params.toString();
  return `/admin/transacciones/historial${s ? '?' + s : ''}`;
}

const AGRUPACION_LABEL: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  EMPRESA_CC: 'Empresa CC',
  ASESOR_COMERCIAL: 'Asesor',
};

const FORMA_PAGO_LABEL: Record<string, string> = {
  POR_CONFIGURACION: 'Por configuración',
  CONSOLIDADO: 'Consolidado',
  POR_MEDIO_PAGO: 'Medio de pago',
};

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });

  const periodoFilter = sp.periodoId
    ? periodos.find((p) => p.id === sp.periodoId)
    : undefined;
  const q = sp.q?.trim() ?? '';
  const tipoFilter = sp.tipo === 'AFILIACION' || sp.tipo === 'MENSUALIDAD' ? sp.tipo : undefined;
  const agrupacionFilter =
    sp.agrupacion === 'INDIVIDUAL' ||
    sp.agrupacion === 'EMPRESA_CC' ||
    sp.agrupacion === 'ASESOR_COMERCIAL'
      ? sp.agrupacion
      : undefined;

  const where: Prisma.ComprobanteWhereInput = {
    procesadoEn: { not: null },
  };
  if (periodoFilter) where.periodoId = periodoFilter.id;
  if (tipoFilter) where.tipo = tipoFilter;
  if (agrupacionFilter) where.agrupacion = agrupacionFilter;
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { numeroComprobanteExt: { contains: q, mode: 'insensitive' } },
      {
        cotizante: {
          OR: [
            { numeroDocumento: { contains: q, mode: 'insensitive' } },
            { primerNombre: { contains: q, mode: 'insensitive' } },
            { primerApellido: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      { cuentaCobro: { razonSocial: { contains: q, mode: 'insensitive' } } },
      { asesorComercial: { nombre: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const comprobantes = await prisma.comprobante.findMany({
    where,
    orderBy: { procesadoEn: 'desc' },
    include: {
      periodo: true,
      cotizante: true,
      cuentaCobro: { select: { codigo: true, razonSocial: true } },
      asesorComercial: { select: { codigo: true, nombre: true } },
      medioPago: { select: { codigo: true, nombre: true } },
      _count: { select: { liquidaciones: true } },
    },
    take: 300,
  });

  // Totales agregados
  const totales = comprobantes.reduce(
    (acc, c) => {
      acc.sgss += Number(c.totalSgss);
      acc.admon += Number(c.totalAdmon);
      acc.servicios += Number(c.totalServicios);
      acc.general += Number(c.totalGeneral);
      return acc;
    },
    { sgss: 0, admon: 0, servicios: 0, general: 0 },
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <History className="h-6 w-6 text-brand-blue" />
          Historial de transacciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Todas las transacciones procesadas — consecutivo, destinatario, forma de pago y
          totales.
        </p>
      </header>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <form
            method="GET"
            action="/admin/transacciones/historial"
            className="flex flex-wrap items-center gap-2"
          >
            <select
              name="periodoId"
              defaultValue={sp.periodoId ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">— Todos los períodos —</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.anio}-{String(p.mes).padStart(2, '0')} · {MESES[p.mes - 1]}
                </option>
              ))}
            </select>
            <select
              name="tipo"
              defaultValue={sp.tipo ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">— Tipo —</option>
              <option value="AFILIACION">Afiliación</option>
              <option value="MENSUALIDAD">Mensualidad</option>
            </select>
            <select
              name="agrupacion"
              defaultValue={sp.agrupacion ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">— Agrupación —</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="EMPRESA_CC">Empresa CC</option>
              <option value="ASESOR_COMERCIAL">Asesor</option>
            </select>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Consecutivo, documento, razón social…"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              Buscar
            </button>
            {(sp.periodoId || sp.tipo || sp.agrupacion || q) && (
              <Link
                href="/admin/transacciones/historial"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Link>
            )}
          </form>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
          <Stat label="Transacciones" value={String(comprobantes.length)} mono={false} />
          <Stat label="Total SGSS" value={copFmt.format(totales.sgss)} />
          <Stat label="Total Admón+Servicios" value={copFmt.format(totales.admon + totales.servicios)} />
          <Stat label="Total general" value={copFmt.format(totales.general)} highlight />
        </div>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {comprobantes.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            {sp.periodoId || sp.tipo || sp.agrupacion || q
              ? 'Sin resultados con los filtros actuales.'
              : 'Aún no se ha procesado ninguna transacción.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Consecutivo</th>
                <th className="px-4 py-2">Período</th>
                <th className="px-4 py-2">Tipo / Agrup.</th>
                <th className="px-4 py-2">Destinatario</th>
                <th className="px-4 py-2">Forma de pago</th>
                <th className="px-4 py-2">Fecha pago</th>
                <th className="px-4 py-2 text-right">Liqs.</th>
                <th className="px-4 py-2 text-right">SGSS</th>
                <th className="px-4 py-2 text-right">Admón</th>
                <th className="px-4 py-2 text-right">Serv.</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comprobantes.map((c) => {
                let destinatario = '—';
                let sub: string | undefined;
                if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
                  destinatario = fullName(c.cotizante);
                  sub = `${c.cotizante.tipoDocumento} ${c.cotizante.numeroDocumento}`;
                } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
                  destinatario = c.cuentaCobro.razonSocial;
                  sub = c.cuentaCobro.codigo;
                } else if (c.agrupacion === 'ASESOR_COMERCIAL' && c.asesorComercial) {
                  destinatario = c.asesorComercial.nombre;
                  sub = c.asesorComercial.codigo;
                }

                const formaPagoLabel = c.formaPago
                  ? FORMA_PAGO_LABEL[c.formaPago] ?? c.formaPago
                  : '—';

                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">
                      {c.consecutivo}
                      {c.numeroComprobanteExt && (
                        <p className="text-[10px] text-slate-500">
                          Ext: {c.numeroComprobanteExt}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {c.periodo.anio}-{String(c.periodo.mes).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <p>{c.tipo === 'AFILIACION' ? 'Afiliación' : 'Mensualidad'}</p>
                      <p className="text-[10px] text-slate-500">
                        {AGRUPACION_LABEL[c.agrupacion] ?? c.agrupacion}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{destinatario}</p>
                      {sub && <p className="font-mono text-[10px] text-slate-500">{sub}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {formaPagoLabel}
                      {c.medioPago && (
                        <p className="text-[10px] text-slate-500">
                          {c.medioPago.codigo} · {c.medioPago.nombre}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {c.fechaPago
                        ? new Date(c.fechaPago).toLocaleDateString('es-CO')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {c._count.liquidaciones}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {copFmt.format(Number(c.totalSgss))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {copFmt.format(Number(c.totalAdmon))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {copFmt.format(Number(c.totalServicios))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                      {copFmt.format(Number(c.totalGeneral))}
                    </td>
                    <td className="px-4 py-2.5">
                      <EstadoChip estado={c.estado} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
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

function EstadoChip({
  estado,
}: {
  estado: 'BORRADOR' | 'EMITIDO' | 'PAGADO' | 'ANULADO';
}) {
  const map = {
    BORRADOR: 'bg-slate-100 text-slate-600 ring-slate-200',
    EMITIDO: 'bg-sky-50 text-sky-700 ring-sky-200',
    PAGADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ANULADO: 'bg-red-50 text-red-700 ring-red-200',
  };
  const labels = {
    BORRADOR: 'Borrador',
    EMITIDO: 'Emitido',
    PAGADO: 'Pagado',
    ANULADO: 'Anulado',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        map[estado],
      )}
    >
      {labels[estado]}
    </span>
  );
}
