import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FileText,
  Banknote,
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Clock3,
  FileSpreadsheet,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { cargarKpis } from '@/lib/dashboard/kpis';
import { cargarAlertasInactividad } from '@/lib/alertas/inactividad';
import { Alert } from '@/components/ui/alert';
import { KpiCard } from './kpi-card';
import { AlertasInactividadSection } from './alertas-inactividad';

export const metadata = { title: 'Dashboard ejecutivo — Sistema PILA' };
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

export default async function DashboardEjecutivoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAuth();
  const sp = await searchParams;
  const scope = await getUserScope();
  if (!scope) return null;

  // Período por defecto: mes actual.
  const ahora = new Date();
  const anio = parseInt(sp.anio ?? String(ahora.getUTCFullYear()), 10);
  const mes = parseInt(sp.mes ?? String(ahora.getUTCMonth() + 1), 10);

  // Resolución del scope:
  //   - Aliado: forzar su sucursal (no puede ver otras).
  //   - Staff: si vino sucursalId en la query, filtrar; si no, consolidado.
  let sucursalId: string | null;
  let scopeLabel: string;
  if (scope.tipo === 'SUCURSAL') {
    sucursalId = scope.sucursalId;
    scopeLabel = 'Tu sucursal';
  } else {
    sucursalId = sp.sucursalId?.trim() || null;
    scopeLabel = sucursalId ? 'Sucursal seleccionada' : 'Todas las sucursales';
  }

  // Cargamos KPIs + alertas + lista de sucursales (para el selector de staff).
  const [kpis, alertas, sucursales, sucursalActual] = await Promise.all([
    cargarKpis({ sucursalId, anio, mes }),
    cargarAlertasInactividad({ sucursalId }),
    scope.tipo === 'STAFF'
      ? prisma.sucursal.findMany({
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        })
      : Promise.resolve([]),
    sucursalId
      ? prisma.sucursal.findUnique({
          where: { id: sucursalId },
          select: { codigo: true, nombre: true },
        })
      : Promise.resolve(null),
  ]);

  // Rutas de drill-down: staff y aliado tienen módulos diferentes.
  const hrefBaseCartera =
    scope.tipo === 'STAFF' ? '/admin/soporte/cartera' : '/admin/administrativo/cartera';
  const hrefBaseEmpresa = '/admin/empresas';

  // Año / mes anterior para etiquetas.
  const anioAnt = mes === 1 ? anio - 1 : anio;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const labelPeriodo = `${MESES[mes - 1]} ${anio}`;
  const labelPeriodoAnt = `${MESES[mesAnt - 1]} ${anioAnt}`;

  // Construye URLs preservando filtros (cambiando solo el campo dado).
  function urlCon(patch: Partial<SP>): string {
    const qs = new URLSearchParams();
    const final = {
      sucursalId: sucursalId ?? '',
      anio: String(anio),
      mes: String(mes),
      ...patch,
    };
    if (final.sucursalId) qs.set('sucursalId', final.sucursalId);
    if (final.anio) qs.set('anio', final.anio);
    if (final.mes) qs.set('mes', final.mes);
    return `/admin/dashboard-ejecutivo?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <LayoutDashboard className="h-6 w-6 text-brand-blue" />
            Dashboard ejecutivo
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Indicadores operativos y financieros de{' '}
            <span className="font-medium">
              {sucursalActual ? `${sucursalActual.codigo} — ${sucursalActual.nombre}` : scopeLabel}
            </span>{' '}
            · período <span className="font-medium">{labelPeriodo}</span>
          </p>
        </div>
      </header>

      {/* Filtros */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        {scope.tipo === 'STAFF' && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Sucursal</span>
            <form method="GET" action="/admin/dashboard-ejecutivo">
              <input type="hidden" name="anio" value={anio} />
              <input type="hidden" name="mes" value={mes} />
              <select
                name="sucursalId"
                defaultValue={sucursalId ?? ''}
                onChange={(e) => e.currentTarget.form?.submit()}
                className="h-9 min-w-[260px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todas las sucursales (consolidado)</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} — {s.nombre}
                  </option>
                ))}
              </select>
            </form>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Año</span>
          <form method="GET" action="/admin/dashboard-ejecutivo">
            <input type="hidden" name="sucursalId" value={sucursalId ?? ''} />
            <input type="hidden" name="mes" value={mes} />
            <select
              name="anio"
              defaultValue={anio}
              onChange={(e) => e.currentTarget.form?.submit()}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {[anio - 2, anio - 1, anio, anio + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </form>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Mes</span>
          <form method="GET" action="/admin/dashboard-ejecutivo">
            <input type="hidden" name="sucursalId" value={sucursalId ?? ''} />
            <input type="hidden" name="anio" value={anio} />
            <select
              name="mes"
              defaultValue={mes}
              onChange={(e) => e.currentTarget.form?.submit()}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </form>
        </label>
        <span className="ml-auto self-center text-[10px] text-slate-400">
          Comparación: <span className="font-medium">{labelPeriodoAnt}</span>
        </span>
      </section>

      {/* Bloque 1: snapshot del aliado */}
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
            sub="MORA_REAL + CARTERA_REAL · todas las edades"
          />
        </div>
      </section>

      {/* Bloque 2: actividad del período */}
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
        hrefBaseCartera={hrefBaseCartera}
        hrefBaseEmpresa={hrefBaseEmpresa}
      />

      {scope.tipo === 'STAFF' && !sucursalId && (
        <Alert variant="info">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-xs">
            Estás viendo el <strong>consolidado de todas las sucursales</strong>. Para comparar el
            desempeño de una sucursal específica, selecciónala arriba.
          </span>
        </Alert>
      )}

      {/* Links rápidos */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-xs font-semibold text-slate-700">Ir a</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin/transacciones"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100"
          >
            Transacciones
          </Link>
          <Link
            href={
              scope.tipo === 'STAFF' ? '/admin/soporte/cartera' : '/admin/administrativo/cartera'
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100"
          >
            Cartera
          </Link>
          <Link
            href={
              scope.tipo === 'STAFF'
                ? '/admin/soporte/incapacidades'
                : '/admin/administrativo/incapacidades'
            }
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100"
          >
            Incapacidades
          </Link>
          <Link
            href="/admin/planos"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100"
          >
            Planos PILA
          </Link>
        </div>
      </section>
      <span className="hidden">{urlCon({})}</span>
    </div>
  );
}
