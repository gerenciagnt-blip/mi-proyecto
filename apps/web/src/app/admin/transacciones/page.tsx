import {
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileStack,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import type { PeriodoContable, SmlvConfig } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  TransaccionWorkflow,
  type PeriodoOpt,
} from './nueva-transaccion/transaccion-workflow';

export const metadata = { title: 'Transacción — Sistema PILA' };
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

/**
 * Calcula los períodos contables habilitados para emitir transacciones:
 *   - Desde el mes en curso hasta diciembre del año actual.
 *   - A partir del 31-dic a las 23:59 (último minuto del año), se suma
 *     enero del año siguiente para permitir facturación anticipada.
 */
function periodosHabilitados(): Array<{ anio: number; mes: number }> {
  const now = new Date();
  const anio = now.getFullYear();
  const mesActual = now.getMonth() + 1;
  const dia = now.getDate();
  const hora = now.getHours();
  const minuto = now.getMinutes();

  const items: Array<{ anio: number; mes: number }> = [];
  for (let m = mesActual; m <= 12; m++) {
    items.push({ anio, mes: m });
  }

  const esUltimoMinutoDelAnio =
    mesActual === 12 && dia === 31 && hora === 23 && minuto >= 59;
  if (esUltimoMinutoDelAnio) {
    items.push({ anio: anio + 1, mes: 1 });
  }

  return items;
}

/**
 * KPI del período en curso para el hub de transacciones.
 *   - facturados: cotizantes únicos con comprobante procesado no anulado
 *     en este período (MENSUALIDAD o AFILIACION).
 *   - pendientes: cotizantes activos sin mensualidad procesada.
 *   - planillasGuardadas: estado CONSOLIDADO, listas para pagar.
 *   - planillasPagadas: estado PAGADA.
 */
async function kpisDelPeriodo(periodoId: string) {
  const [
    comprobantesActivos,
    cotizantesActivos,
    planillasGuardadas,
    planillasPagadas,
  ] = await Promise.all([
    prisma.comprobante.findMany({
      where: {
        periodoId,
        estado: { not: 'ANULADO' },
        procesadoEn: { not: null },
        tipo: 'MENSUALIDAD',
        agrupacion: 'INDIVIDUAL',
      },
      select: { cotizanteId: true },
    }),
    prisma.cotizante.count({
      where: { afiliaciones: { some: { estado: 'ACTIVA' } } },
    }),
    prisma.planilla.count({ where: { periodoId, estado: 'CONSOLIDADO' } }),
    prisma.planilla.count({ where: { periodoId, estado: 'PAGADA' } }),
  ]);

  const facturados = new Set(
    comprobantesActivos
      .map((c) => c.cotizanteId)
      .filter((x): x is string => x != null),
  ).size;
  const pendientes = Math.max(0, cotizantesActivos - facturados);

  return {
    facturados,
    pendientes,
    planillasGuardadas,
    planillasPagadas,
  };
}

async function asegurarPeriodos(
  smlv: SmlvConfig,
): Promise<PeriodoContable[]> {
  const disponibles = periodosHabilitados();
  // Upsert de cada período disponible
  for (const d of disponibles) {
    await prisma.periodoContable.upsert({
      where: { anio_mes: { anio: d.anio, mes: d.mes } },
      create: { anio: d.anio, mes: d.mes, smlvSnapshot: smlv.valor },
      update: {},
    });
  }
  return prisma.periodoContable.findMany({
    where: { OR: disponibles.map((d) => ({ anio: d.anio, mes: d.mes })) },
    orderBy: [{ anio: 'asc' }, { mes: 'asc' }],
  });
}

export default async function TransaccionPage() {
  const smlvConfig = await prisma.smlvConfig.findUnique({
    where: { id: 'singleton' },
  });

  const periodos = smlvConfig ? await asegurarPeriodos(smlvConfig) : [];

  const periodoOpts: PeriodoOpt[] = periodos.map((p) => ({
    id: p.id,
    anio: p.anio,
    mes: p.mes,
    label: `${p.anio}-${String(p.mes).padStart(2, '0')}`,
    mesLabel: MESES[p.mes - 1] ?? '',
    cerrado: p.estado === 'CERRADO',
  }));

  // KPI del período en curso (mes actual). Útiles para saber de un vistazo
  // dónde está el mes: cuántos facturados, cuántos pendientes en cartera,
  // cuántas planillas listas para pagar y cuántas ya pagadas.
  const now = new Date();
  const periodoActual = periodos.find(
    (p) => p.anio === now.getFullYear() && p.mes === now.getMonth() + 1,
  );
  const kpis = periodoActual
    ? await kpisDelPeriodo(periodoActual.id)
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <ArrowRightLeft className="h-6 w-6 text-brand-blue" />
          Transacción
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Emisión de liquidaciones y pre-facturación por cotizante, empresa CC o asesor.
        </p>
      </header>

      {!smlvConfig ? (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">SMLV no configurado</p>
            <p className="mt-0.5 text-xs">
              Antes de procesar transacciones, configura el SMLV vigente en{' '}
              Catálogos → SMLV.
            </p>
          </div>
        </Alert>
      ) : periodoOpts.length === 0 ? (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>No hay períodos disponibles para emitir transacciones.</span>
        </Alert>
      ) : (
        <>
          {kpis && (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi
                icon={CheckCircle2}
                label="Facturados del mes"
                value={kpis.facturados}
                tone="emerald"
              />
              <Kpi
                icon={Clock3}
                label="Pendientes (cartera)"
                value={kpis.pendientes}
                tone="amber"
              />
              <Kpi
                icon={FileStack}
                label="Planillas guardadas"
                value={kpis.planillasGuardadas}
                tone="sky"
              />
              <Kpi
                icon={Banknote}
                label="Planillas pagadas"
                value={kpis.planillasPagadas}
                tone="violet"
              />
            </section>
          )}
          <TransaccionWorkflow periodos={periodoOpts} />
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'sky' | 'violet';
}) {
  const toneBg = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
  }[tone];
  const toneBorder = {
    emerald: 'border-emerald-200',
    amber: 'border-amber-200',
    sky: 'border-sky-200',
    violet: 'border-violet-200',
  }[tone];
  return (
    <div
      className={cn('rounded-xl border bg-white p-4 shadow-sm', toneBorder)}
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
      <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}
