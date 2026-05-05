/**
 * Comprobante de pago Efipay APROBADO. Efipay redirige aquí desde el
 * checkout via `result_urls.approved`. Pasa query params como
 * `payment_id`, `transaction_id` y/o `reference` que usamos para localizar
 * la `EfipayTransaccion` correspondiente.
 *
 * Si el webhook ya llegó cuando aterrizamos acá, la trx ya está APROBADA
 * y el CobroAliado PAGADO. Si no llegó (gap de 1-2 segundos), mostramos
 * "pago en confirmación" igual con todos los datos disponibles — el banner
 * se actualizará al siguiente refresh.
 *
 * El comprobante es imprimible (botón "Imprimir / Descargar PDF" usa el
 * diálogo de impresión nativo del navegador → permite "Guardar como PDF").
 * El CSS @media print oculta los botones y deja solo el comprobante.
 */

import Link from 'next/link';
import { CheckCircle2, ArrowRight, Building2, FileText } from 'lucide-react';
import { formatCOP } from '@/lib/format';
import { ImprimirComprobanteButton } from '../_components/imprimir-comprobante-button';
import {
  buscarTransaccionEfipay,
  type EfipaySearchParams,
} from '../_components/buscar-transaccion';

export const metadata = { title: 'Comprobante de pago — Sistema PILA' };
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

function formatFechaLarga(d: Date): string {
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PagoEfipayExitoPage({
  searchParams,
}: {
  searchParams: Promise<EfipaySearchParams>;
}) {
  const sp = await searchParams;
  const trx = await buscarTransaccionEfipay(sp);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 print:bg-white print:py-0">
      {/* Estilos solo para impresión */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
          .print-card {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }
          body { background: white !important; }
        }
      `}</style>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Banner de éxito (oculto en impresión, el comprobante ya tiene su propio header) */}
        <div className="no-print flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">¡Pago aprobado!</p>
            <p className="text-xs text-emerald-700">
              La confirmación oficial llega vía webhook en unos segundos. Tu cobro queda registrado
              como pagado automáticamente.
            </p>
          </div>
        </div>

        {/* Comprobante */}
        <article
          id="comprobante"
          className="print-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-float"
        >
          {/* Header del comprobante */}
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-brand-blue/5 to-emerald-50 px-8 py-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Sistema PILA
              </p>
              <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-900">
                Comprobante de pago
              </h1>
              <p className="mt-1 text-xs text-slate-500">Pasarela Efipay · Servicio plataforma</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                APROBADO
              </span>
              {trx && (
                <p className="mt-2 font-mono text-xs text-slate-600">
                  Consec.: <strong>{trx.referencia}</strong>
                </p>
              )}
            </div>
          </header>

          {/* Cuerpo */}
          <div className="px-8 py-6">
            {trx ? (
              <>
                {/* Bloque "ALIADO" */}
                <section className="mb-6">
                  <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    <Building2 className="h-3 w-3" />
                    Aliado
                  </h2>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Sucursal</dt>
                      <dd className="font-medium text-slate-900">{trx.cobro.sucursal.nombre}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Código</dt>
                      <dd className="font-mono text-slate-700">{trx.cobro.sucursal.codigo}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Período facturado</dt>
                      <dd className="text-slate-700">
                        {MESES[trx.cobro.periodo.mes - 1]} {trx.cobro.periodo.anio}
                      </dd>
                    </div>
                  </dl>
                </section>

                {/* Bloque "DETALLE" */}
                <section className="mb-6">
                  <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    <FileText className="h-3 w-3" />
                    Detalle del pago
                  </h2>
                  <table className="mt-3 w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 text-slate-600">Monto del cobro</td>
                        <td className="py-2 text-right font-mono text-slate-900">
                          {formatCOP(Number(trx.montoBase))}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600">
                          Costo pasarela{' '}
                          <span className="text-xs text-slate-400">
                            ({((Number(trx.sobrecosto) / Number(trx.montoBase)) * 100).toFixed(2)}
                            %)
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono text-slate-700">
                          + {formatCOP(Number(trx.sobrecosto))}
                        </td>
                      </tr>
                      <tr className="border-t-2 border-slate-300">
                        <td className="pt-3 text-sm font-bold text-slate-900">Total pagado</td>
                        <td className="pt-3 text-right font-mono text-lg font-bold text-brand-blue-dark">
                          {formatCOP(Number(trx.montoCobrado))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Bloque "TRANSACCIÓN" */}
                <section>
                  <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Datos de la transacción
                  </h2>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    <Row label="Fecha del pago">
                      {formatFechaLarga(trx.aprobadaEn ?? trx.iniciadaEn)}
                    </Row>
                    {trx.efipayPaymentId && (
                      <Row label="ID Efipay">
                        <span className="break-all font-mono">{trx.efipayPaymentId}</span>
                      </Row>
                    )}
                    <Row label="Referencia interna">
                      <span className="font-mono">{trx.referencia}</span>
                    </Row>
                    <Row label="Estado">
                      <span className="font-semibold text-emerald-700">{trx.estado}</span>
                    </Row>
                  </dl>
                </section>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-600">
                  Tu pago se procesó correctamente. La confirmación oficial llegará en unos segundos
                  vía webhook.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  No pudimos cargar el detalle automáticamente — refresca o revisa el banner de
                  cobros desde el panel.
                </p>
              </div>
            )}
          </div>

          {/* Footer del comprobante */}
          <footer className="border-t border-slate-100 bg-slate-50 px-8 py-3">
            <p className="text-[10px] text-slate-500">
              Este comprobante es generado automáticamente al confirmarse el pago. Conserva una
              copia para tu contabilidad. Para soporte:{' '}
              <span className="font-medium text-slate-700">soporte@sistema-pila.co</span>
            </p>
          </footer>
        </article>

        {/* Acciones (no-print) */}
        <div className="no-print flex flex-col gap-2 sm:flex-row sm:justify-between">
          <ImprimirComprobanteButton />
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
