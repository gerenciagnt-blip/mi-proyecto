/**
 * Landing tras un pago Efipay RECHAZADO. Muestra el detalle del intento
 * con motivo del rechazo y permite reintentar.
 */

import Link from 'next/link';
import { XCircle, ArrowRight, RefreshCcw, AlertTriangle } from 'lucide-react';
import { formatCOP } from '@/lib/format';
import {
  buscarTransaccionEfipay,
  type EfipaySearchParams,
} from '../_components/buscar-transaccion';

export const metadata = { title: 'Pago rechazado — Sistema PILA' };
export const dynamic = 'force-dynamic';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export default async function PagoEfipayRechazadoPage({
  searchParams,
}: {
  searchParams: Promise<EfipaySearchParams>;
}) {
  const sp = await searchParams;
  const trx = await buscarTransaccionEfipay(sp);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 shadow-card-float">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-9 w-9 text-rose-600" />
            </div>
            <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-slate-900">
              Pago rechazado
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              La pasarela rechazó tu pago. Esto puede ser por fondos insuficientes, datos
              incorrectos o cancelación manual.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Tu cobro sigue pendiente — puedes reintentar el pago cuando quieras.
            </p>
          </div>

          {trx && (
            <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
              <Row label="Cobro">
                <span className="font-mono">{trx.referencia}</span>
              </Row>
              <Row label="Período">
                {MESES[trx.cobro.periodo.mes - 1]} {trx.cobro.periodo.anio}
              </Row>
              <Row label="Monto intentado">
                <span className="font-mono">{formatCOP(Number(trx.montoCobrado))}</span>
              </Row>
              {trx.motivo && (
                <Row label="Motivo">
                  <span className="text-rose-700">{trx.motivo}</span>
                </Row>
              )}
              <Row label="Fecha">{(trx.rechazadaEn ?? trx.iniciadaEn).toLocaleString('es-CO')}</Row>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Reintentar pago
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark"
          >
            Volver al panel
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="text-center text-[10px] text-slate-400">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Si crees que el pago se procesó pero aparece como rechazado, contacta a soporte.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}
