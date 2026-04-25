import Link from 'next/link';
import {
  FileSpreadsheet,
  FileStack,
  Save,
  CheckCircle2,
  Building2,
  User,
  AlertCircle,
  Download,
} from 'lucide-react';
import type { EstadoPlanilla, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getUserScope } from '@/lib/sucursal-scope';
import { cargarDuenosPorSucursal } from '@/lib/duenos-sucursal';
import { formatCOP, fullName } from '@/lib/format';
import { GenerarPlanillasButton } from './generar-button';
import { AnularPlanillaButton } from './anular-button';
import { MarcarPagadaDialog } from './marcar-pagada-dialog';
import { PagosimpleCell } from './pagosimple-cell';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';

export const metadata = { title: 'Planos PILA — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Tab = 'consolidado' | 'guardado' | 'validacion' | 'pagadas';
type SP = { tab?: string; sucursalId?: string };

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

function mesLabel(anio: number, mes: number) {
  return `${MESES[mes - 1] ?? ''} ${anio}`;
}

const TIPO_PLANILLA_LABEL: Record<string, string> = {
  E: 'Empleados',
  I: 'Independientes',
  Y: 'Indep. empresa',
  N: 'Correcciones',
  K: 'Estudiantes',
  A: 'Novedad ingreso',
  S: 'Servicio dom.',
};

const ESTADO_LABEL: Record<EstadoPlanilla, string> = {
  CONSOLIDADO: 'Guardada',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
};

export default async function PlanosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const tab: Tab =
    tabRaw === 'guardado' || tabRaw === 'pagadas' || tabRaw === 'validacion'
      ? tabRaw
      : 'consolidado';
  const sucursalFilter = sp.sucursalId?.trim() || '';

  // Período vigente = mes en curso
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  const periodo = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });

  if (!periodo) {
    return (
      <div className="space-y-6">
        <Header tab={tab} />
        <Alert variant="warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No hay período contable del mes en curso. Ve a{' '}
            <Link href="/admin/transacciones" className="underline">
              Transacción
            </Link>{' '}
            para inicializarlo.
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

  const qs = sucursalFilter ? `&sucursalId=${encodeURIComponent(sucursalFilter)}` : '';

  return (
    <div className="space-y-6">
      <Header tab={tab} />

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

      {tab === 'consolidado' && (
        <TabConsolidado
          periodoId={periodo.id}
          staffSucursalFilter={esStaff ? sucursalFilter || null : null}
        />
      )}
      {tab === 'guardado' && (
        <TabGuardado
          periodoId={periodo.id}
          staffSucursalFilter={esStaff ? sucursalFilter || null : null}
        />
      )}
      {tab === 'validacion' && (
        <TabValidacion
          periodoId={periodo.id}
          staffSucursalFilter={esStaff ? sucursalFilter || null : null}
        />
      )}
      {tab === 'pagadas' && (
        <TabPagadas staffSucursalFilter={esStaff ? sucursalFilter || null : null} />
      )}
    </div>
  );
}

// ================== Header =====================

function Header({ tab: _tab }: { tab: Tab }) {
  return (
    <header>
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
        <FileSpreadsheet className="h-6 w-6 text-brand-blue" />
        Planos PILA
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Agrupa los comprobantes facturados en planillas por empresa (tipo E) o por independiente
        (tipo I), listas para generar el archivo plano.
      </p>
    </header>
  );
}

// ================== Tab link =====================

function TabLink({
  href,
  active,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: typeof FileStack;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
        active
          ? 'border-brand-blue text-brand-blue'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            active ? 'bg-brand-blue/10 text-brand-blue' : 'bg-slate-100 text-slate-600',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// ================== Tab Consolidado =====================

async function TabConsolidado({
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
    let aportanteLabel: string;
    let aportanteSub: string;

    if (af.modalidad === 'DEPENDIENTE') {
      if (!af.empresa) {
        sinAgrupar++;
        continue;
      }
      key = `E|${af.empresa.id}|${paAnio}-${paMes}`;
      tipo = 'E';
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
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ================== Tab Guardado =====================
// Planillas CONSOLIDADO sin error (o aún sin validar). Listas para
// pagar — la celda PagoSimple permite reintentar validate o pasar a PSE.

async function TabGuardado({
  periodoId,
  staffSucursalFilter,
}: {
  periodoId: string;
  staffSucursalFilter: string | null;
}) {
  return (
    <PlanillasTable
      periodoId={periodoId}
      estado="CONSOLIDADO"
      pagosimpleFilter="sin_error"
      staffSucursalFilter={staffSucursalFilter}
    />
  );
}

// ================== Tab Validación =====================
// Planillas CONSOLIDADO con error retornado por PagoSimple. El operador
// detectó inconsistencias en el plano — el usuario debe corregirlas en
// los datos de origen (afiliaciones / comprobantes) y volver a validar.

async function TabValidacion({
  periodoId,
  staffSucursalFilter,
}: {
  periodoId: string;
  staffSucursalFilter: string | null;
}) {
  return (
    <PlanillasTable
      periodoId={periodoId}
      estado="CONSOLIDADO"
      pagosimpleFilter="con_error"
      staffSucursalFilter={staffSucursalFilter}
    />
  );
}

// ================== Tab Pagadas =====================

async function TabPagadas({ staffSucursalFilter }: { staffSucursalFilter: string | null }) {
  return <PlanillasTable estado="PAGADA" showPeriodo staffSucursalFilter={staffSucursalFilter} />;
}

// ================== Planillas table =====================

async function PlanillasTable({
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
                      {psEnabled && estado === 'CONSOLIDADO' && (
                        <PagosimpleCell
                          planillaId={p.id}
                          pagosimpleNumero={p.pagosimpleNumero}
                          pagosimpleEstadoValidacion={p.pagosimpleEstadoValidacion}
                          pagosimplePaymentUrl={p.pagosimplePaymentUrl}
                        />
                      )}
                      <a
                        href={`/api/planos/${p.id}/plano.txt`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                        title="Descargar archivo plano"
                      >
                        <Download className="h-3.5 w-3.5" />
                        TXT
                      </a>
                      {estado === 'CONSOLIDADO' && (
                        <>
                          <MarcarPagadaDialog planillaId={p.id} consecutivo={p.consecutivo} />
                          <AnularPlanillaButton planillaId={p.id} />
                        </>
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

// ================== Stats helpers =====================

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const label = TIPO_PLANILLA_LABEL[tipo] ?? tipo;
  const isE = tipo === 'E';
  const Icon = isE ? Building2 : User;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        isE
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : 'bg-violet-50 text-violet-700 ring-violet-200',
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono font-bold">{tipo}</span>
      <span>·</span>
      <span>{label}</span>
    </span>
  );
}

function EstadoBadge({ estado }: { estado: EstadoPlanilla }) {
  const map = {
    CONSOLIDADO: 'bg-amber-50 text-amber-700 ring-amber-200',
    PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ANULADA: 'bg-red-50 text-red-700 ring-red-200',
  }[estado];
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        map,
      )}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
