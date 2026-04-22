'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  MessageSquare,
  Phone,
  Mail,
  MapPin,
  StickyNote,
  MoreHorizontal,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  registrarGestionAction,
  listarGestionesAction,
  type AccionGestion,
} from './actions';

const ACCIONES: Array<{ id: AccionGestion; label: string; icon: typeof Phone }> = [
  { id: 'LLAMADA', label: 'Llamada', icon: Phone },
  { id: 'EMAIL', label: 'Correo', icon: Mail },
  { id: 'SMS', label: 'SMS', icon: MessageSquare },
  { id: 'VISITA', label: 'Visita', icon: MapPin },
  { id: 'NOTA', label: 'Nota', icon: StickyNote },
  { id: 'OTRO', label: 'Otro', icon: MoreHorizontal },
];

const ACCION_ICON: Record<AccionGestion, typeof Phone> = {
  LLAMADA: Phone,
  EMAIL: Mail,
  SMS: MessageSquare,
  VISITA: MapPin,
  NOTA: StickyNote,
  OTRO: MoreHorizontal,
};

type Gestion = {
  id: string;
  accion: string;
  descripcion: string;
  userName: string | null;
  createdAt: Date;
};

export function GestionButton({
  cotizanteId,
  periodoId,
  cotizanteNombre,
  gestionesIniciales,
}: {
  cotizanteId: string;
  periodoId: string;
  cotizanteNombre: string;
  gestionesIniciales: number;
}) {
  const [open, setOpen] = useState(false);
  const count = gestionesIniciales;

  return (
    <>
      <button
        type="button"
        title="Gestión de cartera"
        onClick={() => setOpen(true)}
        className="relative flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <GestionDialogContent
          cotizanteId={cotizanteId}
          periodoId={periodoId}
          cotizanteNombre={cotizanteNombre}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GestionDialogContent({
  cotizanteId,
  periodoId,
  cotizanteNombre,
  onClose,
}: {
  cotizanteId: string;
  periodoId: string;
  cotizanteNombre: string;
  onClose: () => void;
}) {
  const [accion, setAccion] = useState<AccionGestion>('LLAMADA');
  const [descripcion, setDescripcion] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [loadingList, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const r = await listarGestionesAction(cotizanteId, periodoId);
      setGestiones(r.map((g) => ({ ...g, createdAt: new Date(g.createdAt) })));
    });
  }, [cotizanteId, periodoId]);

  const onGuardar = () => {
    setError(null);
    if (!descripcion.trim()) {
      setError('Escribe una descripción');
      return;
    }
    start(async () => {
      const r = await registrarGestionAction(cotizanteId, periodoId, accion, descripcion);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDescripcion('');
      // Reload list
      const lista = await listarGestionesAction(cotizanteId, periodoId);
      setGestiones(lista.map((g) => ({ ...g, createdAt: new Date(g.createdAt) })));
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Gestión de cartera"
      description={cotizanteNombre}
      size="md"
    >
      <div className="space-y-4">
        {/* Form agregar gestión */}
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <div>
            <Label className="text-xs">Acción</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ACCIONES.map((a) => {
                const Icon = a.icon;
                const active = accion === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccion(a.id)}
                    className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${
                      active
                        ? 'border-brand-blue bg-brand-blue/5 text-brand-blue-dark'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="desc" className="text-xs">
              Descripción *
            </Label>
            <textarea
              id="desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Detalle de la gestión realizada..."
              className="mt-1 w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <Alert variant="danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="gradient"
              onClick={onGuardar}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Registrar gestión
            </Button>
          </div>
        </section>

        {/* Bitácora */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Bitácora ({gestiones.length})
          </h3>

          {loadingList && gestiones.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
            </div>
          ) : gestiones.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              Sin gestiones registradas para este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {gestiones.map((g) => {
                const Icon = ACCION_ICON[g.accion as AccionGestion] ?? StickyNote;
                return (
                  <li
                    key={g.id}
                    className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800">
                          {g.accion}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {g.createdAt.toLocaleString('es-CO')}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-700">{g.descripcion}</p>
                      {g.userName && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          por {g.userName}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex justify-end">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Dialog>
  );
}
