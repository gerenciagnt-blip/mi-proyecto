'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Paperclip, Trash2 } from 'lucide-react';
// NOTA: NO importar enums runtime de '@pila/db' — arrastra Prisma al
// bundle del navegador. Usamos los literales de validations.ts.
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { gestionarReporteAtAction } from '@/app/admin/administrativo/reporte-at/actions';
import {
  ESTADO_LABEL,
  ESTADOS_REPORTE_AT,
  type ReporteATEstadoLit,
} from '@/lib/reporte-at/validations';

const TRANSICIONES_BASE: ReporteATEstadoLit[] = [...ESTADOS_REPORTE_AT];

export function CambiarEstadoReporteAtForm({
  reporteId,
  estadoActual,
}: {
  reporteId: string;
  estadoActual: ReporteATEstadoLit;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [nuevoEstado, setNuevoEstado] = useState<ReporteATEstadoLit>(
    estadoActual === 'RADICADO' ? 'EN_REVISION' : 'CERRADO',
  );
  const [descripcion, setDescripcion] = useState('');
  const [tipoDoc, setTipoDoc] = useState<'FURAT' | 'OTRO'>('FURAT');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const opciones = TRANSICIONES_BASE.filter((e) => e !== estadoActual);

  function quitarArchivo() {
    setArchivo(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function enviar() {
    setError(null);
    setOk(null);
    const fd = new FormData();
    fd.set('reporteAtId', reporteId);
    fd.set('nuevoEstado', nuevoEstado);
    fd.set('descripcion', descripcion);
    fd.set('documentoTipo', tipoDoc);
    if (archivo) fd.set('furat', archivo);

    startTransition(async () => {
      const r = await gestionarReporteAtAction({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOk(r.mensaje ?? 'Estado actualizado');
      setDescripcion('');
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
      <h3 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wider text-slate-700">
        Gestionar estado
      </h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_auto]">
        <select
          value={nuevoEstado}
          onChange={(e) => setNuevoEstado(e.target.value as ReporteATEstadoLit)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          {opciones.map((e) => (
            <option key={e} value={e}>
              → {ESTADO_LABEL[e]}
            </option>
          ))}
        </select>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Observación obligatoria (qué cambió y por qué)…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        />
        <Button type="button" onClick={enviar} disabled={pending || descripcion.trim().length < 3}>
          {pending ? 'Guardando…' : 'Cambiar estado'}
        </Button>
      </div>

      {/* Adjunto opcional (FURAT u otro soporte) */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_auto]">
        <select
          value={tipoDoc}
          onChange={(e) => setTipoDoc(e.target.value as 'FURAT' | 'OTRO')}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          <option value="FURAT">FURAT</option>
          <option value="OTRO">Otro soporte</option>
        </select>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm text-slate-600 hover:border-brand-blue">
          <Paperclip className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {archivo ? archivo.name : 'Adjuntar archivo (PDF / imagen, máx 5 MB)'}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
        {archivo && (
          <button
            type="button"
            onClick={quitarArchivo}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-500 hover:border-red-300 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        Los soportes se conservan 30 días desde que se cargan; pasado ese tiempo el archivo se
        elimina del sistema (queda registro en la bitácora).
      </p>

      {error && (
        <Alert variant="danger" className="mt-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}
      {ok && (
        <Alert variant="success" className="mt-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </Alert>
      )}
    </section>
  );
}
