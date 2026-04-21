import Link from 'next/link';
import { ArrowLeft, FileStack, Receipt, Building2, Users2 } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { GenerarComprobantesButton } from './generar-button';
import {
  ComprobantesTable,
  type ComprobanteRow,
} from './comprobantes-table';

export const metadata = { title: 'Comprobantes — Sistema PILA' };
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

type SP = { periodoId?: string; tab?: string };

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

type Tab = 'afiliacion' | 'mensualidad' | 'asesor';

const TABS: { id: Tab; label: string; icon: typeof Receipt; desc: string }[] = [
  {
    id: 'afiliacion',
    label: 'Afiliaciones',
    icon: Receipt,
    desc: 'Vinculaciones — primer comprobante del cotizante',
  },
  {
    id: 'mensualidad',
    label: 'Mensualidades',
    icon: Building2,
    desc: 'Individuales y por Empresa CC',
  },
  {
    id: 'asesor',
    label: 'Por Asesor',
    icon: Users2,
    desc: 'Reporte informativo de liquidaciones por asesor',
  },
];

function buildTabHref(periodoId: string, tab: Tab) {
  return `/admin/transacciones/comprobantes?periodoId=${periodoId}&tab=${tab}`;
}

export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    include: {
      _count: { select: { comprobantes: true, liquidaciones: true } },
    },
  });

  const now = new Date();
  const periodo =
    (sp.periodoId && periodos.find((p) => p.id === sp.periodoId)) ||
    periodos.find((p) => p.anio === now.getFullYear() && p.mes === now.getMonth() + 1) ||
    periodos[0] ||
    null;

  const tab: Tab = (sp.tab === 'mensualidad' || sp.tab === 'asesor') ? sp.tab : 'afiliacion';

  // Filtros por tab
  const filters: Prisma.ComprobanteWhereInput =
    tab === 'afiliacion'
      ? { tipo: 'AFILIACION' }
      : tab === 'mensualidad'
        ? {
            tipo: 'MENSUALIDAD',
            agrupacion: { in: ['INDIVIDUAL', 'EMPRESA_CC'] },
          }
        : { agrupacion: 'ASESOR_COMERCIAL' };

  const comprobantesRaw = periodo
    ? await prisma.comprobante.findMany({
        where: { periodoId: periodo.id, ...filters },
        orderBy: { consecutivo: 'asc' },
        include: {
          cotizante: true,
          cuentaCobro: { select: { codigo: true, razonSocial: true, nit: true } },
          asesorComercial: { select: { codigo: true, nombre: true } },
          liquidaciones: {
            include: {
              liquidacion: {
                include: {
                  afiliacion: {
                    include: {
                      cotizante: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const rows: ComprobanteRow[] = comprobantesRaw.map((c) => {
    let destinatario = '—';
    let destinatarioSub: string | undefined;
    if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
      destinatario = fullName(c.cotizante);
      destinatarioSub = `${c.cotizante.tipoDocumento} ${c.cotizante.numeroDocumento}`;
    } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
      destinatario = c.cuentaCobro.razonSocial;
      destinatarioSub =
        c.cuentaCobro.nit != null
          ? `${c.cuentaCobro.codigo} · NIT ${c.cuentaCobro.nit}`
          : c.cuentaCobro.codigo;
    } else if (c.agrupacion === 'ASESOR_COMERCIAL' && c.asesorComercial) {
      destinatario = c.asesorComercial.nombre;
      destinatarioSub = c.asesorComercial.codigo;
    }

    return {
      id: c.id,
      consecutivo: c.consecutivo,
      tipo: c.tipo,
      agrupacion: c.agrupacion,
      destinatario,
      destinatarioSub,
      totalEmpleador: Number(c.totalEmpleador),
      totalTrabajador: Number(c.totalTrabajador),
      totalGeneral: Number(c.totalGeneral),
      estado: c.estado,
      observaciones: c.observaciones,
      liquidaciones: c.liquidaciones.map((cl) => ({
        id: cl.liquidacion.id,
        tipo: cl.liquidacion.tipo,
        diasCotizados: cl.liquidacion.diasCotizados,
        ibc: Number(cl.liquidacion.ibc),
        totalGeneral: Number(cl.liquidacion.totalGeneral),
        cotizante: {
          nombreCompleto: fullName(cl.liquidacion.afiliacion.cotizante),
          numeroDocumento: cl.liquidacion.afiliacion.cotizante.numeroDocumento,
        },
      })),
    };
  });

  // Conteos por tab (para mostrar en los headers)
  const counts = periodo
    ? await prisma.comprobante.groupBy({
        by: ['tipo', 'agrupacion'],
        where: { periodoId: periodo.id },
        _count: true,
      })
    : [];
  const countAfiliacion = counts
    .filter((c) => c.tipo === 'AFILIACION')
    .reduce((s, c) => s + c._count, 0);
  const countMensualidad = counts
    .filter((c) => c.tipo === 'MENSUALIDAD' && c.agrupacion !== 'ASESOR_COMERCIAL')
    .reduce((s, c) => s + c._count, 0);
  const countAsesor = counts
    .filter((c) => c.agrupacion === 'ASESOR_COMERCIAL')
    .reduce((s, c) => s + c._count, 0);
  const tabCounts = {
    afiliacion: countAfiliacion,
    mensualidad: countMensualidad,
    asesor: countAsesor,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/transacciones"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Transacciones</span>
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <FileStack className="h-6 w-6 text-brand-blue" />
            Comprobantes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Agrupadores de liquidaciones emitidos al destinatario con consecutivo propio.
          </p>
        </div>
        {periodo && <GenerarComprobantesButton periodoId={periodo.id} disabled={periodo.estado === 'CERRADO'} />}
      </header>

      {!periodo ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">
            Aún no hay períodos — crea uno desde{' '}
            <Link href="/admin/transacciones" className="underline">
              Transacciones
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/* Selector de período */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Período
                </span>
                {periodos.map((p) => {
                  const active = p.id === periodo.id;
                  return (
                    <Link
                      key={p.id}
                      href={`/admin/transacciones/comprobantes?periodoId=${p.id}&tab=${tab}`}
                      className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-brand-blue/10 text-brand-blue-dark'
                          : 'text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      {p.anio}-{String(p.mes).padStart(2, '0')}{' '}
                      <span className="font-normal text-slate-400">
                        ({p._count.comprobantes})
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {MESES[periodo.mes - 1]} {periodo.anio} · {periodo._count.liquidaciones}{' '}
                liquidaciones en el período
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <Link
                    key={t.id}
                    href={buildTabHref(periodo.id, t.id)}
                    className={cn(
                      'flex flex-1 items-start gap-3 px-5 py-3 transition',
                      active ? 'bg-brand-blue/5' : 'hover:bg-slate-50',
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 h-5 w-5 shrink-0',
                        active ? 'text-brand-blue' : 'text-slate-400',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            active ? 'text-brand-blue-dark' : 'text-slate-700',
                          )}
                        >
                          {t.label}
                        </span>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                          {tabCounts[t.id]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{t.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <ComprobantesTable rows={rows} />
        </>
      )}
    </div>
  );
}
