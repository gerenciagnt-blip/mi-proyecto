import { ArrowRightLeft, AlertCircle } from 'lucide-react';
import type { PeriodoContable, SmlvConfig } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
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
        <TransaccionWorkflow periodos={periodoOpts} />
      )}
    </div>
  );
}
