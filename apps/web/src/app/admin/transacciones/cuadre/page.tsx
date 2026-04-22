import Link from 'next/link';
import {
  Calculator,
  Calendar,
  CreditCard,
  Wallet,
  Briefcase,
  Sparkles,
  FileStack,
  Ban,
  Download,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Cuadre de caja — Sistema PILA' };
export const dynamic = 'force-dynamic';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function hoyISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fullName(c: {
  primerNombre: string;
  primerApellido: string;
}) {
  return `${c.primerNombre} ${c.primerApellido}`.trim();
}

/** Identifica si un concepto es un COBRO INTERNO del aliado (no va al
 * operador PILA): se detecta por la palabra "interno" en el subconcepto. */
function esConceptoInterno(c: { subconcepto: string | null }): boolean {
  return c.subconcepto?.toLowerCase().includes('interno') ?? false;
}

type SP = { fecha?: string; desde?: string; hasta?: string };

/** Parsea YYYY-MM-DD como mediodía UTC para evitar corrimiento por timezone. */
function parseIsoToUtcNoon(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function diaSiguienteIso(iso: string): string {
  const dt = parseIsoToUtcNoon(iso);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function diaAnteriorIso(iso: string): string {
  const dt = parseIsoToUtcNoon(iso);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export default async function CuadreCajaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const valid = (s?: string) => (s?.match(/^\d{4}-\d{2}-\d{2}$/) ? s : null);

  // Modo rango: si viene `desde` y `hasta` usa rango, sino usa `fecha` (o hoy).
  const hoy = hoyISO();
  const rangoDesde = valid(sp.desde);
  const rangoHasta = valid(sp.hasta);
  const fechaUnica = valid(sp.fecha);

  let desdeIso: string;
  let hastaIso: string;
  const esRango = !!(rangoDesde && rangoHasta);
  if (esRango) {
    desdeIso = rangoDesde;
    hastaIso = rangoHasta;
    // Swap si el usuario invierte
    if (desdeIso > hastaIso) [desdeIso, hastaIso] = [hastaIso, desdeIso];
  } else {
    desdeIso = fechaUnica ?? hoy;
    hastaIso = desdeIso;
  }

  // Rango [desdeIso 00:00 UTC, hastaIso+1 00:00 UTC)
  const [yDe, mDe, dDe] = desdeIso.split('-').map(Number);
  const [yHa, mHa, dHa] = hastaIso.split('-').map(Number);
  const desde = new Date(Date.UTC(yDe!, mDe! - 1, dDe!, 0, 0, 0));
  const hasta = new Date(Date.UTC(yHa!, mHa! - 1, dHa!, 0, 0, 0));
  hasta.setUTCDate(hasta.getUTCDate() + 1);
  const diaUnico = desdeIso === hastaIso;

  // Nota: fechaPago es la fecha en la que el dinero entró a caja.
  // Usamos fechaPago para cuadrar. procesadoEn sirve como orden secundario.
  const comprobantes = await prisma.comprobante.findMany({
    where: {
      fechaPago: { gte: desde, lt: hasta },
      procesadoEn: { not: null },
    },
    orderBy: { procesadoEn: 'desc' },
    include: {
      medioPago: { select: { id: true, codigo: true, nombre: true } },
      cotizante: {
        select: {
          tipoDocumento: true,
          numeroDocumento: true,
          primerNombre: true,
          primerApellido: true,
        },
      },
      cuentaCobro: { select: { codigo: true, razonSocial: true } },
      asesorComercial: { select: { codigo: true, nombre: true } },
      createdBy: { select: { name: true, email: true } },
      liquidaciones: {
        include: {
          liquidacion: {
            include: {
              conceptos: { select: { concepto: true, subconcepto: true, valor: true } },
            },
          },
        },
      },
    },
  });

  // Sumario por comprobante: desglose en SGSS real, SGSS interno, ADMIN, SERVICIO
  type DesgloseComp = {
    sgssReal: number;
    sgssInterno: number;
    admon: number;
    servicios: number;
  };

  function desgloseDe(
    liquidaciones: (typeof comprobantes)[number]['liquidaciones'],
  ): DesgloseComp {
    const acc = { sgssReal: 0, sgssInterno: 0, admon: 0, servicios: 0 };
    for (const cl of liquidaciones) {
      for (const c of cl.liquidacion.conceptos) {
        const valor = Number(c.valor);
        if (c.concepto === 'ADMIN') {
          acc.admon += valor;
          continue;
        }
        if (c.concepto === 'SERVICIO') {
          acc.servicios += valor;
          continue;
        }
        // SGSS: EPS/AFP/ARL/CCF/SENA/ICBF/FSP
        if (esConceptoInterno(c)) acc.sgssInterno += valor;
        else acc.sgssReal += valor;
      }
    }
    return acc;
  }

  // Stats del día
  const activos = comprobantes.filter((c) => c.estado !== 'ANULADO');
  const anulados = comprobantes.filter((c) => c.estado === 'ANULADO');

  const totalActivo = activos.reduce((s, c) => s + Number(c.totalGeneral), 0);
  const totalAnulado = anulados.reduce((s, c) => s + Number(c.totalGeneral), 0);

  const desgloseDia = activos.reduce(
    (acc, c) => {
      const d = desgloseDe(c.liquidaciones);
      acc.sgssReal += d.sgssReal;
      acc.sgssInterno += d.sgssInterno;
      acc.admon += d.admon;
      acc.servicios += d.servicios;
      return acc;
    },
    { sgssReal: 0, sgssInterno: 0, admon: 0, servicios: 0 },
  );

  // Agrupado por medio de pago (solo activos)
  const porMedio = new Map<
    string,
    { codigo: string; nombre: string; count: number; total: number }
  >();
  for (const c of activos) {
    const key = c.medioPago?.id ?? 'SIN_MEDIO';
    const codigo = c.medioPago?.codigo ?? '—';
    const nombre = c.medioPago?.nombre ?? 'Sin medio de pago';
    const curr = porMedio.get(key) ?? { codigo, nombre, count: 0, total: 0 };
    curr.count++;
    curr.total += Number(c.totalGeneral);
    porMedio.set(key, curr);
  }
  const mediosOrdenados = Array.from(porMedio.values()).sort(
    (a, b) => b.total - a.total,
  );

  // Navegación rápida día anterior / siguiente (solo en modo día único)
  const prevIso = diaAnteriorIso(desdeIso);
  const nextIso = diaSiguienteIso(desdeIso);

  // Link de descarga Excel con los filtros actuales
  const qsExcel = new URLSearchParams();
  qsExcel.set('desde', desdeIso);
  qsExcel.set('hasta', hastaIso);
  const excelHref = `/api/transacciones/cuadre/excel?${qsExcel.toString()}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Calculator className="h-6 w-6 text-brand-blue" />
            Cuadre de caja
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pagos recibidos agrupados por medio de pago y concepto.
          </p>
        </div>
        <a
          href={excelHref}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar Excel
        </a>
      </header>

      {/* Selector de fecha / rango */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {diaUnico && (
              <Link
                href={`/admin/transacciones/cuadre?fecha=${prevIso}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                title="Día anterior"
              >
                ‹
              </Link>
            )}
            <form
              method="GET"
              action="/admin/transacciones/cuadre"
              className="flex flex-wrap items-center gap-2"
            >
              <Calendar className="h-4 w-4 text-slate-400" />
              <label className="text-[11px] text-slate-500">Desde</label>
              <input
                type="date"
                name="desde"
                defaultValue={desdeIso}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              />
              <label className="text-[11px] text-slate-500">Hasta</label>
              <input
                type="date"
                name="hasta"
                defaultValue={hastaIso}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Ver
              </button>
              {(desdeIso !== hoy || hastaIso !== hoy) && (
                <Link
                  href="/admin/transacciones/cuadre"
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Hoy
                </Link>
              )}
            </form>
            {diaUnico && (
              <Link
                href={`/admin/transacciones/cuadre?fecha=${nextIso}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                title="Día siguiente"
              >
                ›
              </Link>
            )}
          </div>
          <p className="text-xs text-slate-500 first-letter:uppercase">
            {diaUnico
              ? fechaLegible(desdeIso)
              : `${fechaLegible(desdeIso)} — ${fechaLegible(hastaIso)}`}
          </p>
        </div>

        {/* Stats del día */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4">
          <Stat
            label="Transacciones"
            value={String(activos.length)}
            mono={false}
            sub={
              anulados.length > 0
                ? `${anulados.length} anuladas`
                : undefined
            }
          />
          <Stat
            label="Recibido neto"
            value={copFmt.format(totalActivo)}
            tone="emerald"
            highlight
          />
          {anulados.length > 0 && (
            <Stat
              label="Anulado"
              value={copFmt.format(totalAnulado)}
              tone="red"
            />
          )}
          <Stat
            label="Medios usados"
            value={String(mediosOrdenados.length)}
            mono={false}
          />
        </div>
      </section>

      {/* Resumen por concepto */}
      {activos.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ConceptoCard
            icon={FileStack}
            label="SGSS"
            value={copFmt.format(desgloseDia.sgssReal)}
            desc="Va al operador PILA"
            tone="sky"
          />
          <ConceptoCard
            icon={Briefcase}
            label="Administración"
            value={copFmt.format(desgloseDia.admon)}
            desc="Ingreso del aliado"
            tone="violet"
          />
          <ConceptoCard
            icon={Sparkles}
            label="Servicios adicionales"
            value={copFmt.format(desgloseDia.servicios)}
            desc="Ingreso del aliado"
            tone="indigo"
          />
          <ConceptoCard
            icon={Wallet}
            label="Cobros internos"
            value={copFmt.format(desgloseDia.sgssInterno)}
            desc="CCF $100 · ARL 1 día — cubre rubros no pactados"
            tone="amber"
          />
        </section>
      )}

      {/* Cards por medio de pago */}
      {mediosOrdenados.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CreditCard className="h-4 w-4 text-brand-blue" />
            Por medio de pago
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {mediosOrdenados.map((m) => {
              const pct = totalActivo > 0 ? (m.total / totalActivo) * 100 : 0;
              return (
                <div
                  key={m.codigo}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {m.codigo}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {m.nombre}
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold tracking-tight text-brand-blue-dark">
                    {copFmt.format(m.total)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {m.count}{' '}
                    {m.count === 1 ? 'transacción' : 'transacciones'} · {pct.toFixed(1)}%
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-blue"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tabla detalle */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {diaUnico ? 'Detalle del día' : 'Detalle del rango'}
          </h2>
        </header>
        {comprobantes.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            Sin transacciones en {diaUnico ? 'esta fecha' : 'el rango seleccionado'}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {!diaUnico && <th className="px-4 py-2">Fecha</th>}
                  <th className="px-4 py-2">Hora</th>
                  <th className="px-4 py-2">Consecutivo</th>
                  <th className="px-4 py-2">Destinatario</th>
                  <th className="px-4 py-2">Medio</th>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2 text-right">SGSS</th>
                  <th className="px-4 py-2 text-right">Admón</th>
                  <th className="px-4 py-2 text-right">Serv.</th>
                  <th className="px-4 py-2 text-right">Internos</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comprobantes.map((c) => {
                  const anulado = c.estado === 'ANULADO';
                  const d = desgloseDe(c.liquidaciones);
                  let destinatario = '—';
                  let sub: string | null = null;
                  if (c.agrupacion === 'INDIVIDUAL' && c.cotizante) {
                    destinatario = fullName(c.cotizante);
                    sub = `${c.cotizante.tipoDocumento} ${c.cotizante.numeroDocumento}`;
                  } else if (c.agrupacion === 'EMPRESA_CC' && c.cuentaCobro) {
                    destinatario = c.cuentaCobro.razonSocial;
                    sub = c.cuentaCobro.codigo;
                  } else if (
                    c.agrupacion === 'ASESOR_COMERCIAL' &&
                    c.asesorComercial
                  ) {
                    destinatario = c.asesorComercial.nombre;
                    sub = c.asesorComercial.codigo;
                  }

                  const hora = c.procesadoEn
                    ? new Date(c.procesadoEn).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                  const fechaPagoIso = c.fechaPago
                    ? new Date(c.fechaPago).toISOString().slice(0, 10)
                    : '—';

                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        anulado && 'bg-red-50/50 text-slate-400 line-through',
                      )}
                    >
                      {!diaUnico && (
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                          {fechaPagoIso}
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-mono text-xs">{hora}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">
                        {c.consecutivo}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium no-underline">{destinatario}</p>
                        {sub && (
                          <p className="font-mono text-[10px] text-slate-500 no-underline">
                            {sub}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {c.medioPago ? (
                          <>
                            <p className="font-medium no-underline">
                              {c.medioPago.codigo}
                            </p>
                            <p className="text-[10px] text-slate-500 no-underline">
                              {c.medioPago.nombre}
                            </p>
                          </>
                        ) : (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {c.createdBy?.name ?? (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {copFmt.format(d.sgssReal)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {copFmt.format(d.admon)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {copFmt.format(d.servicios)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-700">
                        {d.sgssInterno > 0
                          ? copFmt.format(d.sgssInterno)
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                        {copFmt.format(Number(c.totalGeneral))}
                      </td>
                      <td className="px-4 py-2.5">
                        {anulado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-200 no-underline">
                            <Ban className="h-3 w-3" />
                            Anulado
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            Recibido
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Nota explicativa */}
      {desgloseDia.sgssInterno > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-medium">ℹ️ Sobre los cobros internos</p>
          <p className="mt-1">
            Los cobros internos ({copFmt.format(desgloseDia.sgssInterno)}) corresponden
            a CCF fijo de $100 y ARL de 1 día (Nivel I) que se aplican cuando el plan
            SGSS del cotizante no los incluye. Son ingresos del aliado — no se
            transfieren al operador PILA con el resto del SGSS.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  mono = true,
  tone = 'slate',
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  tone?: 'slate' | 'emerald' | 'red';
  highlight?: boolean;
}) {
  const toneCls = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    red: 'text-red-700',
  }[tone];
  return (
    <div className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tracking-tight',
          mono && 'font-mono',
          toneCls,
          highlight && 'text-2xl',
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
      )}
    </div>
  );
}

function ConceptoCard({
  icon: Icon,
  label,
  value,
  desc,
  tone,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  desc: string;
  tone: 'sky' | 'violet' | 'indigo' | 'amber';
}) {
  const toneBg = {
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];
  const toneBorder = {
    sky: 'border-sky-200',
    violet: 'border-violet-200',
    indigo: 'border-indigo-200',
    amber: 'border-amber-200',
  }[tone];
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm',
        toneBorder,
      )}
    >
      <div
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg',
          toneBg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{desc}</p>
    </div>
  );
}
