import Link from 'next/link';
import { FileStack, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { getUserScope } from '@/lib/sucursal-scope';
import { cargarDuenosPorSucursal } from '@/lib/duenos-sucursal';
import { PeriodoSelector, type PeriodoOption } from './periodo-selector';
import { type Tab, type SP, parsePeriodoParam, formatPeriodoValue, mesLabel } from './_helpers';
import { PlanosHeader } from './_components/header';
import { TabLink } from './_components/tab-link';
import { TabConsolidado } from './_components/tab-consolidado';
import { PlanillasTable } from './_components/planillas-table';

export const metadata = { title: 'Planos PILA — Sistema PILA' };
export const dynamic = 'force-dynamic';

/**
 * Página principal del módulo Planos. Orquesta:
 *   - Selector de período (con histórico).
 *   - Tabs Consolidado / Guardado / Validación / Pagadas.
 *   - Filtro por sucursal (solo staff).
 *
 * La lógica de cada tab vive en `_components/`. Antes este archivo tenía
 * 1070 líneas con todo inline; se partió el 2026-05-17 para reducir el
 * scope cognitivo y facilitar futuros cambios.
 */
export default async function PlanosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermiso('planos');
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const tab: Tab =
    tabRaw === 'guardado' || tabRaw === 'pagadas' || tabRaw === 'validacion'
      ? tabRaw
      : 'consolidado';
  const sucursalFilter = sp.sucursalId?.trim() || '';

  // Resolver período a visualizar:
  //   - Si viene `?periodo=YYYY-MM` → ese (modo histórico).
  //   - Si no → mes en curso (default).
  // Si el período pedido no existe en BD, mostramos alert.
  const now = new Date();
  const currentMonth = { anio: now.getFullYear(), mes: now.getMonth() + 1 };
  const requestedPeriodo = parsePeriodoParam(sp.periodo);
  const periodoCoords = requestedPeriodo ?? currentMonth;
  const esHistorico =
    requestedPeriodo !== null &&
    formatPeriodoValue(requestedPeriodo.anio, requestedPeriodo.mes) !==
      formatPeriodoValue(currentMonth.anio, currentMonth.mes);

  // Lista de períodos disponibles para el selector (últimos 12 más recientes,
  // priorizando los que tienen actividad — planillas o comprobantes).
  const [periodo, periodosCrudos] = await Promise.all([
    prisma.periodoContable.findUnique({
      where: { anio_mes: { anio: periodoCoords.anio, mes: periodoCoords.mes } },
    }),
    prisma.periodoContable.findMany({
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 12,
      select: { anio: true, mes: true, estado: true },
    }),
  ]);

  // Garantizar que el mes en curso aparezca como opción aunque aún no
  // exista en BD (al inicio del mes el operador todavía no lo abrió).
  const currentMonthValue = formatPeriodoValue(currentMonth.anio, currentMonth.mes);
  const periodos: PeriodoOption[] = (() => {
    const list: PeriodoOption[] = periodosCrudos.map((p) => ({
      value: formatPeriodoValue(p.anio, p.mes),
      anio: p.anio,
      mes: p.mes,
      estado: p.estado === 'CERRADO' ? 'CERRADO' : 'ABIERTO',
    }));
    if (!list.some((p) => p.value === currentMonthValue)) {
      list.unshift({
        value: currentMonthValue,
        anio: currentMonth.anio,
        mes: currentMonth.mes,
        estado: 'ABIERTO',
      });
    }
    return list;
  })();
  const actualValue = formatPeriodoValue(periodoCoords.anio, periodoCoords.mes);

  if (!periodo) {
    return (
      <div className="space-y-6">
        <PlanosHeader />
        <PeriodoSelector
          periodos={periodos}
          actualValue={actualValue}
          currentMonthValue={currentMonthValue}
        />
        <Alert variant="warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No existe período contable para {actualValue}.{' '}
            {esHistorico
              ? 'Ese mes nunca se abrió en el sistema. Selecciona otro período.'
              : 'Ve a '}
            {!esHistorico && (
              <>
                <Link href="/admin/transacciones" className="underline">
                  Transacción
                </Link>{' '}
                para inicializarlo.
              </>
            )}
          </span>
        </Alert>
      </div>
    );
  }

  // Scope: SUCURSAL ve sólo comprobantes/planillas de su sucursal.
  // Staff (ADMIN/SOPORTE) puede además filtrar explícitamente por sucursal.
  const scope = await getUserScope();
  const esStaff = scope?.tipo === 'STAFF';
  const sucursalAplicada: string | null =
    scope?.tipo === 'SUCURSAL'
      ? scope.sucursalId
      : esStaff && sucursalFilter
        ? sucursalFilter
        : null;

  const planillaScope = sucursalAplicada ? { sucursalId: sucursalAplicada } : {};
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

  // Listado de sucursales para el selector (sólo staff)
  let sucursalesList: Array<{ id: string; nombre: string }> = [];
  let duenosBySuc: Map<string, string> | null = null;
  if (esStaff) {
    const [sucs, duenos] = await Promise.all([
      prisma.sucursal.findMany({
        where: { active: true },
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true },
      }),
      cargarDuenosPorSucursal(),
    ]);
    sucursalesList = sucs;
    duenosBySuc = duenos;
  }

  // Conteos para badges en tabs
  const [countConsolidado, countGuardado, countValidacion, countPagadas] = await Promise.all([
    // Comprobantes del período sin planilla activa
    prisma.comprobante.count({
      where: {
        periodoId: periodo.id,
        procesadoEn: { not: null },
        estado: { not: 'ANULADO' },
        planillas: { none: {} },
        ...(compScopeOR.length > 0 ? { OR: compScopeOR } : {}),
      },
    }),
    // "Guardado" = ya pasó por PagoSimple OK: tiene pagosimpleNumero
    // y estado limpio (OK / PENDIENTE / null tras OK).
    prisma.planilla.count({
      where: {
        periodoId: periodo.id,
        estado: 'CONSOLIDADO',
        pagosimpleNumero: { not: null },
        OR: [
          { pagosimpleEstadoValidacion: null },
          { pagosimpleEstadoValidacion: 'OK' },
          { pagosimpleEstadoValidacion: 'PENDIENTE' },
        ],
        ...planillaScope,
      },
    }),
    // "Validación" = necesita atención: o no se pudo subir
    // (pagosimpleNumero=null) o el operador rechazó con error.
    prisma.planilla.count({
      where: {
        periodoId: periodo.id,
        estado: 'CONSOLIDADO',
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
        ...planillaScope,
      },
    }),
    prisma.planilla.count({
      where: { periodoId: periodo.id, estado: 'PAGADA', ...planillaScope },
    }),
  ]);

  // Preserva sucursalId + periodo en los links de tabs para mantener el
  // contexto histórico al navegar entre Consolidado/Guardado/etc.
  const qsParts: string[] = [];
  if (sucursalFilter) qsParts.push(`sucursalId=${encodeURIComponent(sucursalFilter)}`);
  if (esHistorico) qsParts.push(`periodo=${actualValue}`);
  const qs = qsParts.length > 0 ? `&${qsParts.join('&')}` : '';

  const staffSucursalFilter = esStaff ? sucursalFilter || null : null;

  return (
    <div className="space-y-6">
      <PlanosHeader />

      {/* Selector de período + banner si es histórico */}
      <div className="flex flex-wrap items-center gap-3">
        <PeriodoSelector
          periodos={periodos}
          actualValue={actualValue}
          currentMonthValue={currentMonthValue}
        />
        {esHistorico && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            <AlertCircle className="h-3.5 w-3.5" />
            Vista histórica · período cerrado o anterior
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          <TabLink
            href={`/admin/planos?tab=consolidado${qs}`}
            active={tab === 'consolidado'}
            icon={FileStack}
            label="Consolidado"
            count={countConsolidado}
          />
          <TabLink
            href={`/admin/planos?tab=guardado${qs}`}
            active={tab === 'guardado'}
            icon={Save}
            label="Guardado"
            count={countGuardado}
          />
          <TabLink
            href={`/admin/planos?tab=validacion${qs}`}
            active={tab === 'validacion'}
            icon={AlertCircle}
            label="Validación"
            count={countValidacion}
          />
          <TabLink
            href={`/admin/planos?tab=pagadas${qs}`}
            active={tab === 'pagadas'}
            icon={CheckCircle2}
            label="Pagadas"
            count={countPagadas}
          />
        </nav>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Período contable en curso:{' '}
          <span className="font-medium text-slate-700">{mesLabel(periodo.anio, periodo.mes)}</span>
        </p>

        {esStaff && (
          <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
            <input type="hidden" name="tab" value={tab} />
            <label htmlFor="sucursalId" className="font-medium text-slate-600">
              Sucursal / dueño aliado:
            </label>
            <select
              id="sucursalId"
              name="sucursalId"
              defaultValue={sucursalFilter}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
            >
              <option value="">Todas las sucursales</option>
              {sucursalesList.map((s) => {
                const dueno = duenosBySuc?.get(s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {dueno ? `${s.nombre} — ${dueno}` : s.nombre}
                  </option>
                );
              })}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Aplicar
            </button>
            {sucursalFilter && (
              <Link
                href={`/admin/planos?tab=${tab}`}
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                Limpiar
              </Link>
            )}
          </form>
        )}
      </div>

      {/* Contenido del tab activo. Cada tab decide su propio query a BD.
          `Guardado`, `Validacion` y `Pagadas` consumen el mismo
          `PlanillasTable` cambiando filtros. */}
      {tab === 'consolidado' && (
        <TabConsolidado periodoId={periodo.id} staffSucursalFilter={staffSucursalFilter} />
      )}
      {tab === 'guardado' && (
        <PlanillasTable
          periodoId={periodo.id}
          estado="CONSOLIDADO"
          pagosimpleFilter="sin_error"
          staffSucursalFilter={staffSucursalFilter}
        />
      )}
      {tab === 'validacion' && (
        <PlanillasTable
          periodoId={periodo.id}
          estado="CONSOLIDADO"
          pagosimpleFilter="con_error"
          staffSucursalFilter={staffSucursalFilter}
        />
      )}
      {tab === 'pagadas' && (
        <PlanillasTable estado="PAGADA" showPeriodo staffSucursalFilter={staffSucursalFilter} />
      )}
    </div>
  );
}
