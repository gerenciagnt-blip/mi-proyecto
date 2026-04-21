'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { saveComprobanteAction, type ActionState } from './actions';

type Initial = {
  nombre: string;
  logoUrl: string;
  encabezado: string;
  pieDePagina: string;
};

export function ComprobanteForm({
  sucursalId,
  initial,
}: {
  sucursalId: string;
  initial: Initial;
}) {
  const bound = saveComprobanteAction.bind(null, sucursalId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="nombre">Nombre del formato</Label>
        <Input
          id="nombre"
          name="nombre"
          required
          defaultValue={initial.nombre}
          placeholder="Predeterminado"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="logoUrl">URL del logo</Label>
        <Input
          id="logoUrl"
          name="logoUrl"
          type="url"
          defaultValue={initial.logoUrl}
          placeholder="https://cdn.tu-aliado.com/logo.png"
          className="mt-1"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Imagen PNG o SVG alojada en un dominio público. Próximamente: subida directa al servidor.
        </p>
        {initial.logoUrl && (
          <div className="mt-3 inline-block rounded-lg border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initial.logoUrl}
              alt="Logo actual"
              style={{ maxHeight: 80, maxWidth: 200 }}
            />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="encabezado">Encabezado (opcional)</Label>
        <textarea
          id="encabezado"
          name="encabezado"
          defaultValue={initial.encabezado}
          rows={3}
          maxLength={500}
          placeholder="Texto libre que aparece al inicio del comprobante"
          className="mt-1 w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text-primary focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15"
        />
      </div>

      <div>
        <Label htmlFor="pieDePagina">Pie de página (opcional)</Label>
        <textarea
          id="pieDePagina"
          name="pieDePagina"
          defaultValue={initial.pieDePagina}
          rows={2}
          maxLength={500}
          placeholder="Texto libre al final del comprobante"
          className="mt-1 w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text-primary focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15"
        />
      </div>

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && <Alert variant="success">Formato guardado</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar formato'}
      </Button>
    </form>
  );
}
