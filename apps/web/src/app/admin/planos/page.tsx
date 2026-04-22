import Link from 'next/link';
import {
  FileSpreadsheet,
  FileStack,
  Save,
  CheckCircle2,
  Building2,
  User,
  AlertCircle,
} from 'lucide-react';
import type { EstadoPlanilla } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP, fullName } from '@/lib/format';
import { GenerarPlanillasButton } from './generar-button';
import { AnularPlanillaButton } from './anular-button';

export const metadata = { title: 'Planos PILA — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Tab = 'consolidado' | 'guardado' | 'pagadas';
type SP = { tab?: string };

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

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const tab: Tab =
    tabRaw === 'guardado' || tabRaw === 'pagadas' ? tabRaw : 'consolidado';

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

  // Conteos para badges en tabs
  const [countConsolidado, countGuardado, countPagadas] = await Promise.all([
    // Comprobantes del período sin planilla activa
    prisma.comprobante.count({
      where: {
        periodoId: periodo.id,
        procesadoEn: { not: null },
        estado: { not: 'ANULADO' },
        planillas: { none: {} },
      },
    }),
    prisma.planilla.count({
      where: { periodoId: periodo.id, estado: 'CONSOLIDADO' },
    }),
    prisma.planilla.count({
      where: { periodoId: periodo.id, estado: 'PAGADA' },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Header tab={tab} />

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          <TabLink
            href="/admin/planos?tab=consolidado"
            active={tab === 'consolidado'}
            icon={FileStack}
            label="Consolidado"
            count={countConsolidado}
          />
          <TabLink
            href="/admin/planos?tab=guardado"
            active={tab === 'guardado'}
            icon={Save}
            label="Guardado"
            count={countGuardado}
          />
          <TabLink
            href="/admin/planos?tab=pagadas"
            active={tab === 'pagadas'}
            icon={CheckCircle2}
            label="Pagadas"
            count={countPagadas}
          />
        </nav>
      </div>

      <p className="text-xs text-slate-500">
        Período contable en curso:{' '}
        <span className="font-medium text-slate-700">
          {mesLabel(periodo.anio, periodo.mes)}
        </span>
      </p>

      {tab === 'consolidado' && <TabConsolidado periodoId={periodo.id} />}
      {tab === 'guardado' && <TabGuardado periodoId={periodo.id} />}
      {tab === 'pagadas' && <TabPagadas />}
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
        Agrupa los comprobantes facturados en planillas por empresa (tipo E)
        o por independiente (tipo I), listas para generar el archivo plano.
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
            active
              ? 'bg-brand-blue/10 text-brand-blue'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// ================== Tab Consolidado =====================

async function TabConsolidado({ periodoId }: { periodoId: string }) {
  // Traer todos los comprobantes pendientes con suficiente info para mostrar
  // el agrupamiento "preview" que se va a generar.
  const comps = await prisma.comprobante.findMany({
    where: {
      periodoId,
      procesadoEn: { not: null },
      estado: { not: 'ANULADO' },
      planillas: { none: {} },
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
          No hay comprobantes pendientes de planilla en este período.
          Factura cotizantes en <Link href="/admin/transacciones" className="underline">Transacción</Link>
          {' '}y vuelve aquí cuando estén listos.
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
      <GenerarPlanillasButton
        periodoId={periodoId}
        disabled={gruposOrdenados.length === 0}
      />

      {/* Tabla preview */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Preview de agrupación
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Al generar se crearán {gruposOrdenados.length} planillas.
            Los comprobantes quedarán enlazados y pasarán a la pestaña Guardado.
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
                    <p className="font-medium text-slate-900">
                      {g.aportanteLabel}
                    </p>
                    {g.aportanteSub && (
                      <p className="font-mono text-[10px] text-slate-500">
                        {g.aportanteSub}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {mesLabel(g.periodoAporteAnio, g.periodoAporteMes)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {g.cotizantes.size}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {g.count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                    {formatCOP(g.total)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium">
                <td colSpan={5} className="px-4 py-2.5 text-right text-xs uppercase tracking-wider text-slate-600">
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

async function TabGuardado({ periodoId }: { periodoId: string }) {
  return <PlanillasTable periodoId={periodoId} estado="CONSOLIDADO" />;
}

// ================== Tab Pagadas =====================

async function TabPagadas() {
  return <PlanillasTable estado="PAGADA" showPeriodo />;
}

// ================== Planillas table =====================

async function PlanillasTable({
  periodoId,
  estado,
  showPeriodo = false,
}: {
  periodoId?: string;
  estado: EstadoPlanilla;
  showPeriodo?: boolean;
}) {
  const planillas = await prisma.planilla.findMany({
    where: {
      ...(periodoId ? { periodoId } : {}),
      estado,
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
              <th className="px-4 py-2">Período aporte</th>
              {showPeriodo && <th className="px-4 py-2">Período contable</th>}
              <th className="px-4 py-2 text-right">Cotizantes</th>
              <th className="px-4 py-2 text-right">Comprobantes</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Estado</th>
              {estado === 'CONSOLIDADO' && (
                <th className="px-4 py-2 text-right">Acciones</th>
              )}
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
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                    {p.consecutivo}
                  </td>
                  <td className="px-4 py-2.5">
                    <TipoBadge tipo={p.tipoPlanilla} />
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">
                      {aportanteLabel}
                    </p>
                    {aportanteSub && (
                      <p className="font-mono text-[10px] text-slate-500">
                        {aportanteSub}
                      </p>
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
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {p._count.comprobantes}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                    {formatCOP(Number(p.totalGeneral))}
                  </td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={p.estado} />
                  </td>
                  {estado === 'CONSOLIDADO' && (
                    <td className="px-4 py-2.5 text-right">
                      <AnularPlanillaButton planillaId={p.id} />
                    </td>
                  )}
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

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
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
