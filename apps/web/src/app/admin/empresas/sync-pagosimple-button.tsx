'use client';

/**
 * Botón + badge de estado de sincronización con PagoSimple.
 *
 * Se usa en el detalle de Empresa y (con el wrapper para cotizantes) en
 * el detalle de cotizante independiente.
 *
 * Estados visuales:
 *   - Sin sincronizar        → badge gris "Sin PagoSimple"
 *   - Sincronizado           → badge verde con contributor_id + fecha
 *   - Error / datos faltantes → alert rojo con el motivo
 *   - En progreso            → botón con spinner
 */

import { useState, useTransition } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  sincronizarEmpresaPagosimpleAction,
  sincronizarCotizantePagosimpleAction,
} from './sync-pagosimple-action';

type Kind = 'empresa' | 'cotizante';

export type SyncPagosimpleButtonProps = {
  kind: Kind;
  /** id de la empresa o del cotizante. */
  id: string;
  /** contributor_id actual (null si nunca se sincronizó). */
  contributorId: string | null;
  /** Última vez que se sincronizó (null si nunca). */
  syncedAt: Date | string | null;
};

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SyncPagosimpleButton(props: SyncPagosimpleButtonProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | null
    | { kind: 'ok'; contributorId: string; mode: 'created' | 'updated' }
    | { kind: 'error'; message: string }
  >(null);

  const [syncedAt, setSyncedAt] = useState(props.syncedAt);
  const [contributorId, setContributorId] = useState(props.contributorId);

  const handleSync = () => {
    setResult(null);
    startTransition(async () => {
      const res =
        props.kind === 'empresa'
          ? await sincronizarEmpresaPagosimpleAction(props.id)
          : await sincronizarCotizantePagosimpleAction(props.id);
      if (res.ok) {
        setResult({ kind: 'ok', contributorId: res.contributorId, mode: res.mode });
        setContributorId(res.contributorId);
        setSyncedAt(new Date());
      } else {
        setResult({ kind: 'error', message: res.error });
      }
    });
  };

  const isSynced = Boolean(contributorId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {isSynced ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200"
            title={`PagoSimple contributor_id: ${contributorId}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sincronizado
            {syncedAt && (
              <span className="font-normal text-emerald-700">· {fmtDate(syncedAt)}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            Sin PagoSimple
          </span>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={pending}
          title={
            isSynced
              ? 'Actualiza los datos del aportante en PagoSimple'
              : 'Crea el aportante en PagoSimple bajo el usuario master'
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{isSynced ? 'Re-sincronizar' : 'Sincronizar con PagoSimple'}</span>
        </Button>

        {isSynced && contributorId && (
          <span className="font-mono text-[11px] text-slate-500">
            contributor_id: {contributorId}
          </span>
        )}
      </div>

      {result?.kind === 'ok' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">
                {result.mode === 'created' ? 'Aportante creado' : 'Aportante actualizado'} en
                PagoSimple
              </p>
              <p className="font-mono text-[11px] text-emerald-700">
                contributor_id: {result.contributorId}
              </p>
            </div>
          </div>
        </div>
      )}
      {result?.kind === 'error' && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{result.message}</span>
        </Alert>
      )}
    </div>
  );
}
