'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { ReporteATEstado } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cambiarEstadoReporteAtAction } from '@/app/admin/administrativo/reporte-at/actions';
import { ESTADO_LABEL } from '@/lib/reporte-at/validations';

const TRANSICIONES_BASE = [
  ReporteATEstado.RADICADO,
  ReporteATEstado.EN_REVISION,
  ReporteATEstado.CERRADO,
  ReporteATEstado.ANULADO,
];

export function CambiarEstadoReporteAtForm({
  reporteId,
  estadoActual,
}: {
  reporteId: string;
  estadoActual: ReporteATEstado;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nuevoEstado, setNuevoEstado] = useState<ReporteATEstado>(
    estadoActual === ReporteATEstado.RADICADO
      ? ReporteATEstado.EN_REVISION
      : ReporteATEstado.CERRADO,
  );
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const opciones = TRANSICIONES_BASE.filter((e) => e !== estadoActual);

  function enviar() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const r = await cambiarEstadoReporteAtAction(reporteId, nuevoEstado, descripcion);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOk(r.mensaje ?? 'Estado actualizado');
      setDescripcion('');
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
          onChange={(e) => setNuevoEstado(e.target.value as ReporteATEstado)}
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
