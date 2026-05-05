/**
 * Landing tras un pago Efipay PENDIENTE — típicamente cuando el aliado
 * eligió pago en efectivo (Baloto, Efecty, etc.) y aún no fue al punto a
 * pagar. Muestra el detalle del intento.
 */

import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { formatCOP } from '@/lib/format';
import { ImprimirComprobanteButton } from '../_components/imprimir-comprobante-button';
import {
  buscarTransaccionEfipay,
  type EfipaySearchParams,
} from '../_components/buscar-transaccion';

export const metadata = { title: 'Pago pendiente — Sistema PILA' };
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

export default async function PagoEfipayPendientePage({
  searchParams,
}: {
  searchParams: Promise<EfipaySearchParams>;
}) {
  const sp = await searchParams;
  const trx = await buscarTransaccionEfipay(sp);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 print:bg-white">
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-lg space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-card-float">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-9 w-9 text-amber-600" />
            </div>
            <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-slate-900">
              Pago en proceso
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Tu pago quedó en estado pendiente. Si elegiste pago en efectivo, completa la
              transacción en el punto físico (Baloto, Efecty o el que hayas seleccionado).
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Tu cobro se marcará como pagado automáticamente cuando recibamos la confirmación de la
              pasarela.
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
              <Row label="Monto a pagar">
                <span className="font-mono font-semibold">
                  {formatCOP(Number(trx.montoCobrado))}
                </span>
              </Row>
              {trx.efipayPaymentId && (
                <Row label="ID Efipay">
                  <span className="break-all font-mono">{trx.efipayPaymentId}</span>
                </Row>
              )}
              <Row label="Iniciado">{trx.iniciadaEn.toLocaleString('es-CO')}</Row>
            </div>
          )}
        </div>

        <div className="no-print flex flex-col gap-2 sm:flex-row sm:justify-center">
          <ImprimirComprobanteButton label="Imprimir instrucciones" />
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark"
          >
            Volver al panel
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
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
