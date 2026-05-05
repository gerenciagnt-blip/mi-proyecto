/**
 * Landing tras un pago Efipay RECHAZADO (tarjeta declinada, PSE cancelado,
 * etc.). El CobroAliado sigue PENDIENTE — el aliado puede reintentar.
 */

import Link from 'next/link';
import { XCircle, ArrowRight, RefreshCcw } from 'lucide-react';

export const metadata = { title: 'Pago rechazado — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default function PagoEfipayRechazadoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 shadow-card-float text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
          <XCircle className="h-9 w-9 text-rose-600" />
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Pago rechazado
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          La pasarela rechazó tu pago. Esto puede ser por fondos insuficientes, datos incorrectos o
          cancelación manual.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Tu cobro sigue pendiente — puedes reintentar el pago cuando quieras.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
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
      </div>
    </div>
  );
}
