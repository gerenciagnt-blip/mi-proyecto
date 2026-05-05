/**
 * Landing tras un pago Efipay APROBADO. Efipay redirige aquí cuando el
 * `result_urls.approved` se dispara.
 *
 * Nota: el estado del CobroAliado se actualiza por WEBHOOK, no por esta
 * página. Esta vista es solo confirmación visual al aliado. Si el webhook
 * aún no llegó cuando aterrizan acá (1-2 segundos de gap típico), el
 * banner de cobros pendientes seguirá mostrando el cobro como PENDIENTE
 * por unos instantes — al refrescar desaparece.
 */

import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export const metadata = { title: 'Pago aprobado — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default function PagoEfipayExitoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-8 shadow-card-float text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Pago aprobado
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Tu pago se procesó correctamente. La confirmación oficial llegará en unos segundos vía
          webhook y tu cobro quedará marcado como pagado.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Si el banner de cobros pendientes aún muestra el cobro, refresca la página en un par de
          minutos.
        </p>
        <Link
          href="/admin"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark"
        >
          Ir al panel
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
