import Link from 'next/link';
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { HistorialRow, type HistorialRowData } from './historial-row';

export const metadata = { title: 'Historial de transacciones — Sistema PILA' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

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

type SP = {
  periodoId?: string;
  tipo?: string;
  agrupacion?: string;
  q?: string;
  page?: string;
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
  if (merged.page && merged.page !== '1') params.set('page', merged.page);
  const s = params.toString();
  return `/admin/transacciones/historial${s ? '?' + s : ''}`;
}

const AGRUPACION_LABEL: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  EMPRESA_CC: 'Empresa CC',
  ASESOR_COMERCIAL: 'Asesor',
};

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });

  const q = sp.q?.trim() ?? '';
  const tipoFilter =
    sp.tipo === 'AFILIACION' || sp.tipo === 'MENSUALIDAD' ? sp.tipo : undefined;
  const agrupacionFilter =
    sp.agrupacion === 'INDIVIDUAL' ||
    sp.agrupacion === 'EMPRESA_CC' ||
    sp.agrupacion === 'ASESOR_COMERCIAL'
      ? sp.agrupacion
      : undefined;

  const where: Prisma.ComprobanteWhereInput = {
    procesadoEn: { not: null },
  };
  if (sp.periodoId) where.periodoId = sp.periodoId;
  if (tipoFilter) where.tipo = tipoFilter;
  if (agrupacionFilter) where.agrupacion = agrupacionFilter;
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { numeroComprobanteExt: { contains: q, mode: 'insensitive' } },
      { numeroPlanilla: { contains: q, mode: 'insensitive' } },
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

  const [total, comprobantes] = await Promise.all([
    prisma.comprobante.count({ where }),
    prisma.comprobante.findMany({
      where,
      orderBy: { procesadoEn: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        periodo: true,
        cotizante: true,
        cuentaCobro: { select: { codigo: true, razonSocial: true } },
        asesorComercial: { select: { codigo: true, nombre: true } },
        medioPago: { select: { codigo: true, nombre: true } },
        liquidaciones: {
          include: {
            liquidacion: {
              include: {
                conceptos: { orderBy: { concepto: 'asc' } },
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const rows: HistorialRowData[] = comprobantes.map((c) => {
    let destinatario = '—';
    let sub: string | null = null;
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

    // Estado derivado:
    //   ANULADO       → anulado
    //   numeroPlanilla → procesado
    //   resto         → en proceso
    const estadoDerivado: HistorialRowData['estadoDerivado'] =
      c.estado === 'ANULADO'
        ? 'ANULADO'
        : c.numeroPlanilla
          ? 'PROCESADO'
          : 'EN_PROCESO';

    // Desglose consolidado de conceptos (suma por tipo de concepto)
    const mapaConceptos = new Map<
      string,
      { concepto: string; subconcepto: string | null; porcentaje: number; valor: number }
    >();
    for (const cl of c.liquidaciones) {
      for (const k of cl.liquidacion.conceptos) {
        const key = `${k.concepto}|${k.subconcepto ?? ''}`;
        const prev = mapaConceptos.get(key);
        if (prev) {
          prev.valor += Number(k.valor);
        } else {
          mapaConceptos.set(key, {
            concepto: k.concepto,
            subconcepto: k.subconcepto,
            porcentaje: Number(k.porcentaje),
            valor: Number(k.valor),
          });
        }
      }
    }
    const conceptos = Array.from(mapaConceptos.values());

    return {
      id: c.id,
      consecutivo: c.consecutivo,
      numeroComprobanteExt: c.numeroComprobanteExt,
      numeroPlanilla: c.numeroPlanilla,
      tipo: c.tipo,
      agrupacion: c.agrupacion,
      tipoLabel: c.tipo === 'AFILIACION' ? 'Afiliación' : 'Mensualidad',
      agrupacionLabel: AGRUPACION_LABEL[c.agrupacion] ?? c.agrupacion,
      periodoLabel: `${c.periodo.anio}-${String(c.periodo.mes).padStart(2, '0')}`,
      fechaPago: c.fechaPago
        ? new Date(c.fechaPago).toLocaleDateString('es-CO')
        : null,
      procesadoEn: c.procesadoEn
        ? new Date(c.procesadoEn).toLocaleString('es-CO')
        : null,
      destinatario,
      destinatarioSub: sub,
      formaPago: c.formaPago,
      medioPago: c.medioPago,
      totalSgss: Number(c.totalSgss),
      totalAdmon: Number(c.totalAdmon),
      totalServicios: Number(c.totalServicios),
      totalGeneral: Number(c.totalGeneral),
      estado: c.estado,
      aplicaNovedadRetiro: c.aplicaNovedadRetiro,
      valorAdminOverride:
        c.valorAdminOverride == null ? null : Number(c.valorAdminOverride),
      estadoDerivado,
      conceptos,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <History className="h-6 w-6 text-brand-blue" />
          Historial de transacciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Todas las transacciones procesadas con sus datos de pago y estado.
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
                placeholder="Consecutivo, documento, razón social, N° planilla…"
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
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            {sp.periodoId || sp.tipo || sp.agrupacion || q
              ? 'Sin resultados con los filtros actuales.'
              : 'Aún no se ha procesado ninguna transacción.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Consecutivo</th>
                    <th className="px-4 py-2">Período</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Destinatario</th>
                    <th className="px-4 py-2">Forma de pago</th>
                    <th className="px-4 py-2">Fecha pago</th>
                    <th className="px-4 py-2 text-right">SGSS</th>
                    <th className="px-4 py-2 text-right">Admón</th>
                    <th className="px-4 py-2 text-right">Serv.</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2">N° planilla</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <HistorialRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-2.5">
                <p className="text-xs text-slate-500">
                  Página <strong>{pageSafe}</strong> de <strong>{totalPages}</strong>{' '}
                  · {total} {total === 1 ? 'transacción' : 'transacciones'}
                </p>
                <div className="flex items-center gap-1">
                  <PageLink
                    href={buildHref({ page: String(pageSafe - 1) }, sp)}
                    disabled={pageSafe <= 1}
                    ariaLabel="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </PageLink>
                  <PageRange current={pageSafe} total={totalPages} sp={sp} />
                  <PageLink
                    href={buildHref({ page: String(pageSafe + 1) }, sp)}
                    disabled={pageSafe >= totalPages}
                    ariaLabel="Página siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </PageLink>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
  ariaLabel,
  active,
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  active?: boolean;
}) {
  if (disabled) {
    return (
      <span
        aria-label={ariaLabel}
        className="flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs text-slate-300"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        'flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs font-medium',
        active
          ? 'bg-brand-blue text-white'
          : 'text-slate-700 hover:bg-slate-200',
      )}
    >
      {children}
    </Link>
  );
}

function PageRange({
  current,
  total,
  sp,
}: {
  current: number;
  total: number;
  sp: SP;
}) {
  // Ventana de 5 páginas alrededor de la actual
  const pages: number[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <>
      {pages.map((p) => (
        <PageLink
          key={p}
          href={buildHref({ page: String(p) }, sp)}
          active={p === current}
        >
          {p}
        </PageLink>
      ))}
    </>
  );
}
