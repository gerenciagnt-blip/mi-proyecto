import Link from 'next/link';
import {
  Building2,
  Briefcase,
  Users,
  Database,
  ArrowRight,
  Wallet,
  HeartPulse,
  FolderArchive,
  ArrowRightLeft,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  UserCheck,
  FileText,
  Banknote,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { auth } from '@/auth';
import { getUserScope } from '@/lib/sucursal-scope';
import { esStaff } from '@/lib/auth-helpers';
import { cargarKpis } from '@/lib/dashboard/kpis';
import { cargarAlertasInactividad } from '@/lib/alertas/inactividad';
import { Alert } from '@/components/ui/alert';
import { CobrosPendientesBanner } from './cobros-pendientes-banner';
import { KpiCard } from './dashboard-ejecutivo/kpi-card';
import { AlertasInactividadSection } from './dashboard-ejecutivo/alertas-inactividad';
import { AutoSubmitSelect } from './dashboard-ejecutivo/auto-submit-select';

export const metadata = { title: 'Inicio — Sistema PILA' };
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

type SP = {
  sucursalId?: string;
  anio?: string;
  mes?: string;
};

/**
 * Página de Inicio unificada (sprint reorg 2026-04-27).
 *
 * Antes había 2 páginas separadas: `/admin` (hub con tarjetas
 * navegacionales) y `/admin/dashboard-ejecutivo` (KPIs por período).
 * El operador pidió fusionarlas — solo "Inicio" en el nav.
 *
 * STAFF (ADMIN/SOPORTE):
 *   - Filtros (Sucursal/Año/Mes) — consolidado por default
 *   - KPIs estado actual + actividad del período
 *   - Alertas de inactividad
 *   - Hub de configuración (sucursales, empresas, usuarios, catálogos)
 *
 * ALIADO (OWNER/USER):
 *   - Banner de cobros pendientes/vencidos
 *   - KPIs estado actual + actividad del período (scopeados a su sucursal)
 *   - Accesos rápidos a sus operaciones del día a día
 *   - Tips
 */
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session?.user) return null;
  const sp = await searchParams;

  if (esStaff(session.user.role)) {
    return <StaffHome sp={sp} />;
  }
  return <AliadoHome sp={sp} />;
}

// ============================================================================
// Helpers compartidos
// ============================================================================

function parsePeriodo(sp: SP): { anio: number; mes: number } {
  const ahora = new Date();
  const anio = parseInt(sp.anio ?? String(ahora.getUTCFullYear()), 10);
  const mes = parseInt(sp.mes ?? String(ahora.getUTCMonth() + 1), 10);
  return { anio, mes };
}

// ============================================================================
// STAFF — Hub + Dashboard Ejecutivo
// ============================================================================

async function StaffHome({ sp }: { sp: SP }) {
  const { anio, mes } = parsePeriodo(sp);
  const sucursalId = sp.sucursalId?.trim() || null;
  const scopeLabel = sucursalId ? 'Sucursal seleccionada' : 'Todas las sucursales';

  const [
    kpis,
    alertas,
    sucursales,
    sucursalActual,
    sucursalesCount,
    empresasCount,
    usuariosCount,
    entidadesCount,
    actividadesCount,
    tiposCotCount,
  ] = await Promise.all([
    cargarKpis({ sucursalId, anio, mes }),
    cargarAlertasInactividad({ sucursalId }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    sucursalId
      ? prisma.sucursal.findUnique({
          where: { id: sucursalId },
          select: { codigo: true, nombre: true },
        })
      : Promise.resolve(null),
    prisma.sucursal.count(),
    prisma.empresa.count(),
    prisma.user.count(),
    prisma.entidadSgss.count(),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
  ]);

  const anioAnt = mes === 1 ? anio - 1 : anio;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const labelPeriodo = `${MESES[mes - 1]} ${anio}`;
  const labelPeriodoAnt = `${MESES[mesAnt - 1]} ${anioAnt}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <LayoutDashboard className="h-6 w-6 text-brand-blue" />
          Inicio · Dashboard ejecutivo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Indicadores de{' '}
          <span className="font-medium">
            {sucursalActual ? `${sucursalActual.codigo} — ${sucursalActual.nombre}` : scopeLabel}
          </span>{' '}
          · período <span className="font-medium">{labelPeriodo}</span>
        </p>
      </header>

      {/* Filtros */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Sucursal</span>
          <form method="GET" action="/admin">
            <input type="hidden" name="anio" value={anio} />
            <input type="hidden" name="mes" value={mes} />
            <AutoSubmitSelect
              name="sucursalId"
              defaultValue={sucursalId ?? ''}
              className="h-9 min-w-[260px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Todas las sucursales (consolidado)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nombre}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Año</span>
          <form method="GET" action="/admin">
            <input type="hidden" name="sucursalId" value={sucursalId ?? ''} />
            <input type="hidden" name="mes" value={mes} />
            <AutoSubmitSelect
              name="anio"
              defaultValue={anio}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {[anio - 2, anio - 1, anio, anio + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Mes</span>
          <form method="GET" action="/admin">
            <input type="hidden" name="sucursalId" value={sucursalId ?? ''} />
            <input type="hidden" name="anio" value={anio} />
            <AutoSubmitSelect
              name="mes"
              defaultValue={mes}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </label>
        <span className="ml-auto self-center text-[10px] text-slate-400">
          Comparación: <span className="font-medium">{labelPeriodoAnt}</span>
        </span>
      </section>

      {/* Estado actual */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Estado actual
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Cotizantes"
            valor={kpis.cotizantes}
            icon={Users}
            sub={`${kpis.afiliacionesActivas} afiliaciones activas`}
            tone="primary"
          />
          <KpiCard
            label="Afiliaciones activas"
            valor={kpis.afiliacionesActivas}
            icon={UserCheck}
            tone="default"
          />
          <KpiCard
            label="Incapacidades activas"
            valor={kpis.incapacidadesActivas}
            icon={HeartPulse}
            tone={kpis.incapacidadesActivas > 0 ? 'warning' : 'default'}
            sub="Radicadas, en revisión o aprobadas (sin pagar)"
          />
          <KpiCard
            label="Cartera pendiente"
            valor={kpis.carteraPendienteValor}
            icon={AlertCircle}
            formato="cop"
            tone={kpis.carteraPendienteValor > 0 ? 'danger' : 'success'}
            sub="MORA_REAL + CARTERA_REAL"
          />
        </div>
      </section>

      {/* Actividad del período */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Actividad del período
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Comprobantes procesados"
            valor={kpis.comprobantesProcesados.actual}
            deltaPct={kpis.comprobantesProcesados.deltaPct}
            icon={FileText}
            tone="primary"
          />
          <KpiCard
            label="Total facturado"
            valor={kpis.totalFacturado.actual}
            deltaPct={kpis.totalFacturado.deltaPct}
            icon={Banknote}
            formato="cop"
            tone="success"
          />
          <KpiCard
            label="Planillas pagadas"
            valor={kpis.planillasPagadas.actual}
            deltaPct={kpis.planillasPagadas.deltaPct}
            icon={FileSpreadsheet}
          />
          <KpiCard
            label="Nuevas incapacidades"
            valor={kpis.incapacidadesRadicadas.actual}
            deltaPct={kpis.incapacidadesRadicadas.deltaPct}
            icon={HeartPulse}
            sub="Radicadas en este período"
          />
          <KpiCard
            label="Cartera recuperada"
            valor={kpis.carteraPagadaValor.actual}
            deltaPct={kpis.carteraPagadaValor.deltaPct}
            icon={CheckCircle2}
            formato="cop"
            tone="success"
            sub="Líneas que pasaron a PAGADA"
          />
          <KpiCard
            label="Tiempo prom. resolución"
            valor={kpis.tiempoPromedioResolucionDias ?? 0}
            icon={Clock3}
            formato="dias"
            tone={
              kpis.tiempoPromedioResolucionDias === null
                ? 'default'
                : kpis.tiempoPromedioResolucionDias < 30
                  ? 'success'
                  : kpis.tiempoPromedioResolucionDias < 60
                    ? 'warning'
                    : 'danger'
            }
            sub="Incapacidades cerradas en últimos 90 días"
          />
        </div>
      </section>

      <AlertasInactividadSection
        alertas={alertas}
        hrefBaseCartera="/admin/soporte/cartera"
        hrefBaseEmpresa="/admin/empresas"
      />

      {!sucursalId && (
        <Alert variant="info">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-xs">
            Estás viendo el <strong>consolidado de todas las sucursales</strong>. Para comparar el
            desempeño de una sucursal específica, selecciónala arriba.
          </span>
        </Alert>
      )}

      {/* Hub de configuración */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Configuración
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardConfig
            href="/admin/sucursales"
            label="Sucursales"
            count={sucursalesCount}
            icon={Building2}
            accent="from-brand-blue to-brand-turquoise"
          />
          <CardConfig
            href="/admin/empresas"
            label="Empresas"
            count={empresasCount}
            icon={Briefcase}
            accent="from-brand-blue to-brand-green"
          />
          <CardConfig
            href="/admin/usuarios"
            label="Usuarios"
            count={usuariosCount}
            icon={Users}
            accent="from-brand-green to-brand-turquoise"
          />
          <CardConfig
            href="/admin/catalogos"
            label="Catálogos"
            count={entidadesCount + actividadesCount + tiposCotCount}
            icon={Database}
            accent="from-brand-turquoise to-brand-blue"
            sub={`${entidadesCount} entidades · ${actividadesCount} CIIU · ${tiposCotCount} tipos`}
          />
        </div>
      </section>
    </div>
  );
}

function CardConfig({
  href,
  label,
  count,
  icon: Icon,
  accent,
  sub,
}: {
  href: string;
  label: string;
  count: number;
  icon: typeof Building2;
  accent: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-brand"
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-start justify-between">
        <Icon className="h-5 w-5 text-slate-400 transition group-hover:text-brand-blue" />
        <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-blue" />
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-heading text-2xl font-bold tracking-tight text-slate-900">
        {count}
      </p>
      {sub && <p className="mt-1 text-[10px] text-slate-500">{sub}</p>}
    </Link>
  );
}

// ============================================================================
// ALIADO — Dashboard scoped + Accesos rápidos
// ============================================================================

async function AliadoHome({ sp }: { sp: SP }) {
  const scope = await getUserScope();
  if (!scope || scope.tipo !== 'SUCURSAL') return null;
  const sucursalId = scope.sucursalId;

  const { anio, mes } = parsePeriodo(sp);

  const [kpis, alertas, sucursal, cobrosPendientes] = await Promise.all([
    cargarKpis({ sucursalId, anio, mes }),
    cargarAlertasInactividad({ sucursalId }),
    prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { codigo: true, nombre: true, bloqueadaPorMora: true },
    }),
    prisma.cobroAliado.findMany({
      where: { sucursalId, estado: { in: ['PENDIENTE', 'VENCIDO'] } },
      orderBy: { fechaLimite: 'asc' },
      include: {
        periodo: { select: { anio: true, mes: true } },
      },
    }),
  ]);

  const labelPeriodo = `${MESES[mes - 1]} ${anio}`;

  const accesosRapidos = [
    { href: '/admin/transacciones', label: 'Generar transacción', icon: ArrowRightLeft },
    { href: '/admin/base-datos', label: 'Crear / buscar afiliación', icon: FolderArchive },
    { href: '/admin/planos', label: 'Planos PILA', icon: FileSpreadsheet },
    { href: '/admin/administrativo/incapacidades', label: 'Radicar incapacidad', icon: HeartPulse },
    { href: '/admin/administrativo/cartera', label: 'Gestionar cartera real', icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <LayoutDashboard className="h-6 w-6 text-brand-blue" />
          Inicio · {sucursal?.codigo ?? '—'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {sucursal?.nombre ?? 'Panel del aliado'} · período{' '}
          <span className="font-medium">{labelPeriodo}</span>
        </p>
      </header>

      {/* Banner cobros pendientes */}
      {cobrosPendientes.length > 0 && (
        <CobrosPendientesBanner
          cobros={cobrosPendientes.map((c) => ({
            id: c.id,
            consecutivo: c.consecutivo,
            total: Number(c.totalCobro),
            fechaLimite: c.fechaLimite,
            estado: c.estado as 'PENDIENTE' | 'VENCIDO',
            periodoAnio: c.periodo.anio,
            periodoMes: c.periodo.mes,
          }))}
          bloqueadaPorMora={sucursal?.bloqueadaPorMora ?? false}
        />
      )}

      {/* Filtros (solo Año/Mes — el aliado no elige sucursal) */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Año</span>
          <form method="GET" action="/admin">
            <input type="hidden" name="mes" value={mes} />
            <AutoSubmitSelect
              name="anio"
              defaultValue={anio}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {[anio - 2, anio - 1, anio, anio + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Mes</span>
          <form method="GET" action="/admin">
            <input type="hidden" name="anio" value={anio} />
            <AutoSubmitSelect
              name="mes"
              defaultValue={mes}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        </label>
      </section>

      {/* KPIs estado actual del aliado */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Tu sucursal hoy
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Cotizantes activos"
            valor={kpis.cotizantes}
            icon={Users}
            tone="primary"
            sub={`${kpis.afiliacionesActivas} afiliaciones`}
          />
          <KpiCard
            label="Cartera pendiente"
            valor={kpis.carteraPendienteValor}
            icon={AlertCircle}
            formato="cop"
            tone={kpis.carteraPendienteValor > 0 ? 'danger' : 'success'}
            sub="Por cobrar SGSS"
          />
          <KpiCard
            label="Incapacidades activas"
            valor={kpis.incapacidadesActivas}
            icon={HeartPulse}
            tone={kpis.incapacidadesActivas > 0 ? 'warning' : 'default'}
            sub="En proceso"
          />
          <KpiCard
            label="Total facturado"
            valor={kpis.totalFacturado.actual}
            deltaPct={kpis.totalFacturado.deltaPct}
            icon={Banknote}
            formato="cop"
            tone="success"
            sub={labelPeriodo}
          />
        </div>
      </section>

      {/* Actividad del período */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Actividad del período
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Comprobantes"
            valor={kpis.comprobantesProcesados.actual}
            deltaPct={kpis.comprobantesProcesados.deltaPct}
            icon={FileText}
          />
          <KpiCard
            label="Planillas pagadas"
            valor={kpis.planillasPagadas.actual}
            deltaPct={kpis.planillasPagadas.deltaPct}
            icon={FileSpreadsheet}
          />
          <KpiCard
            label="Cartera recuperada"
            valor={kpis.carteraPagadaValor.actual}
            deltaPct={kpis.carteraPagadaValor.deltaPct}
            icon={CheckCircle2}
            formato="cop"
            tone="success"
          />
        </div>
      </section>

      {/* Alertas de inactividad para el aliado */}
      <AlertasInactividadSection
        alertas={alertas}
        hrefBaseCartera="/admin/administrativo/cartera"
        hrefBaseEmpresa="/admin/empresas"
      />

      {/* Accesos rápidos */}
      <section>
        <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wider text-slate-500">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {accesosRapidos.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue hover:text-brand-blue-dark hover:shadow-brand"
              >
                <Icon className="h-4 w-4 text-slate-400 group-hover:text-brand-blue" />
                <span className="flex-1 text-xs font-medium">{a.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-brand-blue" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tips */}
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="flex items-center gap-1 font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          <Clock3 className="h-4 w-4" />
          Tips del día
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>• Revisa cartera real para evitar intereses de mora con las entidades SGSS.</li>
          <li>
            • Radica la incapacidad adjuntando al menos el certificado original; los demás
            documentos son deseables.
          </li>
          <li>
            • Los documentos de incapacidad se conservan 120 días en el sistema; después queda el
            registro como evidencia.
          </li>
        </ul>
      </section>
    </div>
  );
}
