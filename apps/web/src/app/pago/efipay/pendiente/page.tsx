/**
 * Landing tras un pago Efipay PENDIENTE — típicamente cuando el aliado
 * eligió pago en efectivo (Baloto, Efecty, etc.) y aún no fue al punto a
 * pagar. El CobroAliado sigue PENDIENTE hasta que llegue el webhook
 * APROBADO o EXPIRADO.
 */

import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';

export const metadata = { title: 'Pago pendiente — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default function PagoEfipayPendientePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-card-float text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Clock className="h-9 w-9 text-amber-600" />
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Pago en proceso
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Tu pago quedó en estado pendiente. Si elegiste pago en efectivo, completa la transacción
          en el punto físico (Baloto, Efecty o el que hayas seleccionado).
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Tu cobro se marcará como pagado automáticamente cuando recibamos la confirmación de la
          pasarela.
        </p>
        <Link
          href="/admin"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark"
        >
          Volver al panel
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
