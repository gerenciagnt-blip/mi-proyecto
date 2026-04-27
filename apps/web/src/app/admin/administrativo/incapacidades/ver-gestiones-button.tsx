'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, LifeBuoy, Building2, Clock3, MessageSquarePlus, CheckCircle2 } from 'lucide-react';
import type { IncapacidadAccionadaPor, IncapacidadEstado } from '@pila/db';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ESTADO_LABEL, ESTADO_TONE } from '@/lib/incapacidades/validations';
import {
  listarGestionesIncapAction,
  gestionAliadoIncapAction,
  type IncapGestionRow,
} from './actions';

export function VerGestionesIncapButton({
  incapacidadId,
  consecutivo,
  gestionesCount,
  cotizanteNombre,
  aliado = false,
}: {
  incapacidadId: string;
  consecutivo: string;
  gestionesCount: number;
  cotizanteNombre: string;
  /** Si true, muestra también un formulario para que el aliado agregue nota. */
  aliado?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<IncapGestionRow[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadError(null);
    setSubmitError(null);
    setSubmitOk(false);
    setRows(null);
    startTransition(async () => {
      try {
        const r = await listarGestionesIncapAction(incapacidadId);
        setRows(r);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Error desconocido');
      }
    });
  }, [open, incapacidadId]);

  function enviarNota() {
    if (!nota.trim()) return;
    setSubmitError(null);
    startTransition(async () => {
      const r = await gestionAliadoIncapAction(incapacidadId, nota);
      if (r.error) {
        setSubmitError(r.error);
        return;
      }
      setNota('');
      setSubmitOk(true);
      // Re-fetch gestiones
      const refreshed = await listarGestionesIncapAction(incapacidadId);
      setRows(refreshed);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
        title="Ver historial de gestiones"
      >
        <Eye className="h-3 w-3" />
        <span>Gestiones</span>
        {gestionesCount > 0 && (
          <span className="ml-0.5 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600">
            {gestionesCount}
          </span>
        )}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Gestiones · ${consecutivo}`}
        description={cotizanteNombre}
        size="md"
      >
        {pending && !rows && <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>}
        {loadError && (
          <Alert variant="danger">
            <span>{loadError}</span>
          </Alert>
        )}
        {rows && rows.length === 0 && (
          <Alert variant="info">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>Aún no hay gestiones registradas.</span>
          </Alert>
        )}
        {rows && rows.length > 0 && (
          <ol className="space-y-3">
            {rows.map((g) => (
              <li key={g.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Sprint Soporte reorg fase 2 — switch exhaustivo (antes
                     ternario que pintaba cualquier futuro valor del enum como
                     ALIADO). */}
                  {(() => {
                    const accionadaPor = g.accionadaPor as IncapacidadAccionadaPor;
                    let tone: string;
                    let icon: React.ReactNode;
                    let label: string;
                    switch (accionadaPor) {
                      case 'SOPORTE':
                        tone = 'bg-sky-50 text-sky-700 ring-sky-200';
                        icon = <LifeBuoy className="h-3 w-3" />;
                        label = 'Soporte';
                        break;
                      case 'ALIADO':
                        tone = 'bg-brand-blue/10 text-brand-blue-dark ring-brand-blue/20';
                        icon = <Building2 className="h-3 w-3" />;
                        label = 'Aliado';
                        break;
                      default: {
                        const _exhaustive: never = accionadaPor;
                        void _exhaustive;
                        tone = 'bg-slate-100 text-slate-600 ring-slate-200';
                        icon = null;
                        label = String(accionadaPor);
                      }
                    }
                    return (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          tone,
                        )}
                      >
                        {icon}
                        {label}
                      </span>
                    );
                  })()}
                  {g.nuevoEstado && (
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        ESTADO_TONE[g.nuevoEstado as IncapacidadEstado] ??
                          'bg-slate-100 text-slate-700',
                      )}
                    >
                      → {ESTADO_LABEL[g.nuevoEstado as IncapacidadEstado] ?? g.nuevoEstado}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    {new Date(g.createdAt).toLocaleString('es-CO')}
                  </span>
                </div>
                {g.userName && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Por <strong>{g.userName}</strong>
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{g.descripcion}</p>
              </li>
            ))}
          </ol>
        )}

        {/* Formulario de nota aliado */}
        {aliado && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <Label htmlFor="nota" className="flex items-center gap-1">
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Agregar nota
            </Label>
            <textarea
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Ej. Enviamos la incapacidad corregida a la EPS hoy."
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            />
            {submitError && (
              <Alert variant="danger" className="mt-2">
                <p>{submitError}</p>
              </Alert>
            )}
            {submitOk && (
              <Alert variant="success" className="mt-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>Nota registrada.</p>
              </Alert>
            )}
            <div className="mt-2 flex justify-end">
              <Button onClick={enviarNota} disabled={pending || !nota.trim()}>
                {pending ? 'Enviando…' : 'Enviar nota'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
