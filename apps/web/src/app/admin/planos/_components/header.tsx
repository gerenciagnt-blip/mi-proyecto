import { FileSpreadsheet } from 'lucide-react';

/** Header común a todos los tabs del módulo Planos. */
export function PlanosHeader() {
  return (
    <header>
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
        <FileSpreadsheet className="h-6 w-6 text-brand-blue" />
        Planos PILA
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Agrupa los comprobantes facturados en planillas por empresa (tipo E) o por independiente
        (tipo I), listas para generar el archivo plano.
      </p>
    </header>
  );
}
