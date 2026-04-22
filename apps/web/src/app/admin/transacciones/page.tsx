import { ArrowRightLeft, AlertCircle } from 'lucide-react';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { TransaccionWorkflow } from './nueva-transaccion/transaccion-workflow';

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

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * Asegura que exista el período del mes en curso. Si no existe y hay SMLV,
 * lo crea automáticamente (eliminando la necesidad de "Abrir período").
 * Devuelve el período del mes actual (o null si no hay SMLV configurado).
 */
async function obtenerPeriodoActualOCrear() {
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;

  const existente = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });
  if (existente) return existente;

  const smlv = await prisma.smlvConfig.findUnique({ where: { id: 'singleton' } });
  if (!smlv) return null;

  return prisma.periodoContable.create({
    data: { anio, mes, smlvSnapshot: smlv.valor },
  });
}

export default async function TransaccionPage() {
  const periodoActual = await obtenerPeriodoActualOCrear();
  const smlvConfig = await prisma.smlvConfig.findUnique({
    where: { id: 'singleton' },
  });

  const now = new Date();
  const anioActual = now.getFullYear();
  const mesActual = now.getMonth() + 1;

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
      ) : !periodoActual ? (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            No se pudo crear el período del mes en curso. Verifica la configuración del
            SMLV.
          </span>
        </Alert>
      ) : (
        <>
          {/* Selector de período (solo el actual — anteriores se gestionan en Historial/Cartera) */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Período contable
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-brand-blue-dark">
                    {anioActual}-{String(mesActual).padStart(2, '0')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {MESES[mesActual - 1]} {anioActual} · SMLV{' '}
                    <span className="font-mono font-medium">
                      {copFmt.format(Number(periodoActual.smlvSnapshot))}
                    </span>
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  Solo se procesan transacciones del mes en curso.
                  <br />
                  Períodos anteriores: ver{' '}
                  <a
                    href="/admin/transacciones/historial"
                    className="underline hover:text-slate-900"
                  >
                    Historial
                  </a>{' '}
                  /{' '}
                  <a
                    href="/admin/transacciones/cartera"
                    className="underline hover:text-slate-900"
                  >
                    Cartera
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Workflow principal */}
          <TransaccionWorkflow
            periodoId={periodoActual.id}
            periodoCerrado={periodoActual.estado === 'CERRADO'}
          />
        </>
      )}
    </div>
  );
}
