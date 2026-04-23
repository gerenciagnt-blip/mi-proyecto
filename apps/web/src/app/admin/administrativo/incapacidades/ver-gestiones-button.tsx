'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  LifeBuoy,
  Building2,
  Clock3,
  MessageSquarePlus,
  CheckCircle2,
} from 'lucide-react';
import type { IncapacidadEstado } from '@pila/db';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  listarGestionesIncapAction,
  gestionAliadoIncapAction,
  type IncapGestionRow,
} from './actions';

const ESTADO_LABEL: Record<IncapacidadEstado, string> = {
  RADICADA: 'Radicada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
  RECHAZADA: 'Rechazada',
};

const ESTADO_TONE: Record<IncapacidadEstado, string> = {
  RADICADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  APROBADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
};

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
        {pending && !rows && (
          <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>
        )}
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
              <li
                key={g.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                      g.accionadaPor === 'SOPORTE'
                        ? 'bg-sky-50 text-sky-700 ring-sky-200'
                        : 'bg-brand-blue/10 text-brand-blue-dark ring-brand-blue/20',
                    )}
                  >
                    {g.accionadaPor === 'SOPORTE' ? (
                      <LifeBuoy className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {g.accionadaPor === 'SOPORTE' ? 'Soporte' : 'Aliado'}
                  </span>
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
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                  {g.descripcion}
                </p>
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
