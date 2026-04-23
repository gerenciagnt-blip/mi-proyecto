'use client';

import { useState, useEffect, useTransition } from 'react';
import { Eye, LifeBuoy, Building2, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import {
  listarGestionesLineaAction,
  type GestionRow,
} from './actions';

const ESTADO_LABEL: Record<string, string> = {
  EN_CONCILIACION: 'En conciliación',
  CONCILIADA: 'Conciliada',
  CARTERA_REAL: 'Cartera real',
  PAGADA_CARTERA_REAL: 'Pagada',
};

const ESTADO_TONE: Record<string, string> = {
  EN_CONCILIACION: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONCILIADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  CARTERA_REAL: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA_CARTERA_REAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/**
 * Botón reutilizable que abre un timeline de gestiones de una línea de
 * cartera. Lo usan tanto la vista de Soporte como la de Administrativo.
 */
export function VerGestionesButton({
  detalladoId,
  gestionesCount,
  cotizante,
  periodo,
  valor,
  /** Variante visual del botón. `inline` para tablas, `chip` con contador. */
  variant = 'inline',
}: {
  detalladoId: string;
  gestionesCount: number;
  cotizante: { tipo: string; numero: string; nombre: string };
  periodo: string;
  valor: number;
  variant?: 'inline' | 'chip';
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<GestionRow[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRows(null);
    startTransition(async () => {
      try {
        const r = await listarGestionesLineaAction(detalladoId);
        setRows(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      }
    });
  }, [open, detalladoId]);

  const trigger =
    variant === 'chip' ? (
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
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
        title="Ver historial de gestiones"
      >
        <Eye className="h-3 w-3" />
        <span>{gestionesCount}</span>
      </button>
    );

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Historial de gestiones"
        description={`${cotizante.tipo} ${cotizante.numero} · ${cotizante.nombre} · ${periodo} · $${valor.toLocaleString('es-CO')}`}
        size="md"
      >
        {pending && !rows && (
          <p className="py-6 text-center text-sm text-slate-500">
            Cargando gestiones…
          </p>
        )}
        {error && (
          <Alert variant="danger">
            <span>{error}</span>
          </Alert>
        )}
        {rows && rows.length === 0 && (
          <Alert variant="info">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>Aún no hay gestiones registradas en esta línea.</span>
          </Alert>
        )}
        {rows && rows.length > 0 && (
          <ol className="space-y-3">
            {rows.map((g) => (
              <li
                key={g.id}
                className="relative rounded-lg border border-slate-200 bg-white p-3"
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
                        ESTADO_TONE[g.nuevoEstado] ?? 'bg-slate-100 text-slate-700',
                      )}
                    >
                      → {ESTADO_LABEL[g.nuevoEstado] ?? g.nuevoEstado}
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
      </Dialog>
    </>
  );
}
