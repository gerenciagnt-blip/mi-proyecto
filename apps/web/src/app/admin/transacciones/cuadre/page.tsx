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
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { getUserScope } from '@/lib/sucursal-scope';
import { cargarDuenosPorSucursal } from '@/lib/duenos-sucursal';
import {
  formatCOP,
  hoyIso,
  parseIsoToUtcNoon,
  fechaLegibleDesdeIso,
  fullName,
} from '@/lib/format';
import { Stat } from '@/components/admin/stat';
import { ConceptoCard } from '@/components/admin/concepto-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const metadata = { title: 'Cuadre de caja — Sistema PILA' };
export const dynamic = 'force-dynamic';

/** Identifica si un concepto es un COBRO INTERNO del aliado (no va al
 * operador PILA): se detecta por la palabra "interno" en el subconcepto. */
function esConceptoInterno(c: { subconcepto: string | null }): boolean {
  return c.subconcepto?.toLowerCase().includes('interno') ?? false;
}

type SP = { fecha?: string; desde?: string; hasta?: string; sucursalId?: string };

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
  const hoy = hoyIso();
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

  // Scope: SUCURSAL sólo ve su caja; STAFF ve todo.
  const scope = await getUserScope();
  const esStaff = scope?.tipo === 'STAFF';
  const sucursalFilter = sp.sucursalId?.trim() ?? '';

  // El staff puede filtrar por sucursal explícita. Si hay filtro, gana
  // sobre el OR de 3 ramas; si no, aplica el scope por rol.
  const scopeOR: Prisma.ComprobanteWhereInput[] = (() => {
    if (scope?.tipo === 'SUCURSAL') {
      return [
        { cotizante: { sucursalId: scope.sucursalId } },
        { cuentaCobro: { sucursalId: scope.sucursalId } },
        {
          asesorComercial: {
            OR: [{ sucursalId: null }, { sucursalId: scope.sucursalId }],
          },
        },
      ];
    }
    if (esStaff && sucursalFilter) {
      return [
        { cotizante: { sucursalId: sucursalFilter } },
        { cuentaCobro: { sucursalId: sucursalFilter } },
        {
          asesorComercial: {
            OR: [{ sucursalId: null }, { sucursalId: sucursalFilter }],
          },
        },
      ];
    }
    return [];
  })();

  // Nota: fechaPago es la fecha en la que el dinero entró a caja.
  // Usamos fechaPago para cuadrar. procesadoEn sirve como orden secundario.
  const comprobantes = await prisma.comprobante.findMany({
    where: {
      fechaPago: { gte: desde, lt: hasta },
      procesadoEn: { not: null },
      ...(scopeOR.length > 0 ? { OR: scopeOR } : {}),
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
          sucursalId: true,
        },
      },
      cuentaCobro: { select: { codigo: true, razonSocial: true, sucursalId: true } },
      asesorComercial: { select: { codigo: true, nombre: true, sucursalId: true } },
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

  const [duenosBySuc, sucursalesList] = await Promise.all([
    esStaff ? cargarDuenosPorSucursal() : Promise.resolve(null),
    esStaff
      ? prisma.sucursal.findMany({
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        })
      : Promise.resolve([]),
  ]);

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
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-green px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" />
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
              <label htmlFor="cuadre-desde" className="text-[11px] text-slate-500">
                Desde
              </label>
              <Input
                id="cuadre-desde"
                type="date"
                name="desde"
                size="sm"
                defaultValue={desdeIso}
                className="w-auto"
              />
              <label htmlFor="cuadre-hasta" className="text-[11px] text-slate-500">
                Hasta
              </label>
              <Input
                id="cuadre-hasta"
                type="date"
                name="hasta"
                size="sm"
                defaultValue={hastaIso}
                className="w-auto"
              />
              {esStaff && (
                <select
                  name="sucursalId"
                  defaultValue={sucursalFilter}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                  title="Filtrar por sucursal / dueño aliado"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursalesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.codigo} · {s.nombre}
                    </option>
                  ))}
                </select>
              )}
              <Button type="submit" variant="primary" size="sm">
                Ver
              </Button>
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
              ? fechaLegibleDesdeIso(desdeIso)
              : `${fechaLegibleDesdeIso(desdeIso)} — ${fechaLegibleDesdeIso(hastaIso)}`}
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
            value={formatCOP(totalActivo)}
            tone="emerald"
            highlight
          />
          {anulados.length > 0 && (
            <Stat
              label="Anulado"
              value={formatCOP(totalAnulado)}
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
            value={formatCOP(desgloseDia.sgssReal)}
            desc="Va al operador PILA"
            tone="sky"
          />
          <ConceptoCard
            icon={Briefcase}
            label="Administración"
            value={formatCOP(desgloseDia.admon)}
            desc="Ingreso del aliado"
            tone="violet"
          />
          <ConceptoCard
            icon={Sparkles}
            label="Servicios adicionales"
            value={formatCOP(desgloseDia.servicios)}
            desc="Ingreso del aliado"
            tone="indigo"
          />
          <ConceptoCard
            icon={Wallet}
            label="Cobros internos"
            value={formatCOP(desgloseDia.sgssInterno)}
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
                    {formatCOP(m.total)}
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
                  {esStaff && <th className="px-4 py-2">Dueño aliado</th>}
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
                  const sucComp =
                    c.cotizante?.sucursalId ??
                    c.cuentaCobro?.sucursalId ??
                    c.asesorComercial?.sucursalId ??
                    null;
                  const dueno =
                    duenosBySuc && sucComp ? (duenosBySuc.get(sucComp) ?? null) : null;

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
                      {esStaff && (
                        <td className="px-4 py-2.5 text-xs text-slate-600 no-underline">
                          {dueno ?? (
                            <span className="italic text-slate-400">—</span>
                          )}
                        </td>
                      )}
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
                        {formatCOP(d.sgssReal)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {formatCOP(d.admon)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {formatCOP(d.servicios)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-700">
                        {d.sgssInterno > 0
                          ? formatCOP(d.sgssInterno)
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                        {formatCOP(Number(c.totalGeneral))}
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
            Los cobros internos ({formatCOP(desgloseDia.sgssInterno)}) corresponden
            a CCF fijo de $100 y ARL de 1 día (Nivel I) que se aplican cuando el plan
            SGSS del cotizante no los incluye. Son ingresos del aliado — no se
            transfieren al operador PILA con el resto del SGSS.
          </p>
        </div>
      )}
    </div>
  );
}

