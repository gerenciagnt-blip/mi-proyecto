'use client';

import { Printer } from 'lucide-react';

/**
 * Botón que dispara el diálogo de impresión nativo del navegador. El
 * usuario puede:
 *   - Imprimir físicamente
 *   - "Guardar como PDF" (todos los browsers modernos lo soportan)
 *
 * El CSS @media print que vive en la página oculta los elementos no
 * imprimibles (botones, header, etc.) para que el comprobante salga
 * limpio.
 */
export function ImprimirComprobanteButton({
  className,
  label = 'Imprimir / Descargar PDF',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50'
      }
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
