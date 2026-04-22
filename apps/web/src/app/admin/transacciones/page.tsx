import Link from 'next/link';
import { ArrowRightLeft, Lock } from 'lucide-react';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { AbrirPeriodoDialog } from './abrir-periodo-dialog';
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

type SP = { periodoId?: string };

export default async function TransaccionPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const periodos = await prisma.periodoContable.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });

  // Período por defecto: el del mes en curso, o el primero abierto, o el primero que exista
  const now = new Date();
  const periodoActual =
    (sp.periodoId && periodos.find((p) => p.id === sp.periodoId)) ||
    periodos.find((p) => p.anio === now.getFullYear() && p.mes === now.getMonth() + 1) ||
    periodos.find((p) => p.estado === 'ABIERTO') ||
    periodos[0] ||
    null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <ArrowRightLeft className="h-6 w-6 text-brand-blue" />
            Transacción
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Emisión de liquidaciones y pre-facturación por cotizante, empresa CC o asesor.
          </p>
        </div>
        <AbrirPeriodoDialog />
      </header>

      {periodos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">
            Aún no hay períodos contables — abre el primero con el botón de arriba.
          </p>
        </div>
      ) : (
        <>
          {/* Selector de período */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Período
                </span>
                {periodos.map((p) => {
                  const active = p.id === periodoActual?.id;
                  return (
                    <Link
                      key={p.id}
                      href={`/admin/transacciones?periodoId=${p.id}`}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-brand-blue/10 text-brand-blue-dark'
                          : 'text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      <span>
                        {p.anio}-{String(p.mes).padStart(2, '0')}
                      </span>
                      {p.estado === 'CERRADO' && (
                        <Lock className="h-3 w-3 text-slate-400" />
                      )}
                    </Link>
                  );
                })}
              </div>
              {periodoActual && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {MESES[periodoActual.mes - 1]} {periodoActual.anio} · SMLV{' '}
                  <span className="font-mono font-medium">
                    {copFmt.format(Number(periodoActual.smlvSnapshot))}
                  </span>{' '}
                  ·{' '}
                  {periodoActual.estado === 'CERRADO' ? (
                    <span className="font-medium text-slate-500">Cerrado</span>
                  ) : (
                    <span className="font-medium text-emerald-700">Abierto</span>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* Workflow: tipo + destinatario + preview + pre-facturar */}
          {periodoActual && (
            <TransaccionWorkflow
              periodoId={periodoActual.id}
              periodoLabel={`${periodoActual.anio}-${String(periodoActual.mes).padStart(2, '0')}`}
              periodoCerrado={periodoActual.estado === 'CERRADO'}
            />
          )}
        </>
      )}
    </div>
  );
}
