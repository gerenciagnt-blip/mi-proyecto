import Link from 'next/link';
import { ArrowLeft, Users, Download, Upload, AlertCircle } from 'lucide-react';
import { requireAuth } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { ImportarCotizantesForm } from './form';

export const metadata = { title: 'Importar cotizantes — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ImportarCotizantesPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/base-datos"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Base de datos
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Users className="h-6 w-6 text-brand-blue" />
          Importar cotizantes (CSV / Excel)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Carga masiva de cotizantes desde un archivo. Las afiliaciones se crean después uno a uno
          desde Base de datos — esta importación solo crea el registro del cotizante.
        </p>
      </header>

      {/* Paso 1: descargar plantilla */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">1 · Descarga la plantilla</h2>
        <p className="mt-1 text-xs text-slate-500">
          Trae el header esperado y un ejemplo. Llénala con tus cotizantes (uno por fila) y volvé a
          esta página para subirla.
        </p>
        <a
          href="/api/cotizantes/template.csv"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar plantilla CSV
        </a>
      </section>

      {/* Paso 2: subir archivo */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Upload className="h-4 w-4 text-brand-blue" />2 · Sube tu archivo
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          CSV o Excel (.xlsx). Máx 5 MB. El sistema valida fila por fila y te muestra cuáles tienen
          errores antes de confirmar.
        </p>
        <div className="mt-4">
          <ImportarCotizantesForm />
        </div>
      </section>

      {/* Reglas */}
      <Alert variant="info">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <div className="space-y-1 text-xs">
          <p>
            <strong>Columnas obligatorias:</strong> tipoDocumento, numeroDocumento, primerNombre,
            primerApellido, fechaNacimiento, genero.
          </p>
          <p>
            <strong>Tipos válidos:</strong> CC, CE, TI, PAS, NIT, RC, NIP.
          </p>
          <p>
            <strong>Género:</strong> M, F, O.
          </p>
          <p>
            <strong>Fecha:</strong> formato AAAA-MM-DD (ej. 1990-04-15).
          </p>
          <p>
            <strong>Duplicados:</strong> si ya existe un cotizante con la misma (tipo doc + número)
            en tu sucursal, se omite — no se duplica ni se sobrescribe.
          </p>
        </div>
      </Alert>
    </div>
  );
}
