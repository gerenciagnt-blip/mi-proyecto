'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { gestionAliadoReporteAtAction } from '../actions';
import { ESTADO_LABEL } from '@/lib/reporte-at/validations';

export type ReporteAtGestionRow = {
  id: string;
  accionadaPor: 'ALIADO' | 'SOPORTE';
  nuevoEstado: string | null;
  descripcion: string;
  userName: string | null;
  createdAt: Date;
};

export function ReporteAtTimeline({
  reporteId,
  gestiones,
  permitirNotaAliado,
}: {
  reporteId: string;
  gestiones: ReporteAtGestionRow[];
  /** Si true, muestra textarea para que el aliado deje una nota. */
  permitirNotaAliado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function enviar() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const r = await gestionAliadoReporteAtAction(reporteId, nota);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOk('Nota agregada');
      setNota('');
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wider text-slate-700">
        Bitácora
      </h3>

      {permitirNotaAliado && (
        <div className="mb-5 space-y-2">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="Agregar una nota para Soporte…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
          />
          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}
          {ok && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{ok}</span>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={enviar}
              disabled={pending || nota.trim().length < 3}
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              {pending ? 'Enviando…' : 'Agregar nota'}
            </Button>
          </div>
        </div>
      )}

      {gestiones.length === 0 ? (
        <p className="text-xs text-slate-500">Sin gestiones registradas.</p>
      ) : (
        <ol className="space-y-3">
          {gestiones.map((g) => (
            <li
              key={g.id}
              className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
            >
              <span
                className={
                  g.accionadaPor === 'SOPORTE'
                    ? 'mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-brand-blue'
                    : 'mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500'
                }
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">
                  {g.userName ?? g.accionadaPor} · {g.createdAt.toLocaleString('es-CO')}
                  {g.nuevoEstado && (
                    <span className="ml-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-blue ring-1 ring-inset ring-brand-blue/30">
                      → {ESTADO_LABEL[g.nuevoEstado as keyof typeof ESTADO_LABEL] ?? g.nuevoEstado}
                    </span>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{g.descripcion}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
