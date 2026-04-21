'use client';

import { useActionState, useState } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
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

  const [preview, setPreview] = useState<string | null>(null);
  const [removeCurrent, setRemoveCurrent] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) {
      setPreview(null);
      return;
    }
    setRemoveCurrent(false);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const hasCurrentLogo = !!initial.logoUrl && !removeCurrent;

  return (
    <form action={action} className="space-y-5">
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
        <Label htmlFor="logo">Logo</Label>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          {/* Preview del logo — nuevo o existente */}
          <div className="flex h-24 w-48 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Nuevo logo" className="max-h-full max-w-full object-contain" />
            ) : hasCurrentLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={initial.logoUrl}
                alt="Logo actual"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-300">
                <ImageIcon className="h-6 w-6" />
                <span className="text-[11px]">Sin logo</span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFile}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:hover:bg-slate-800"
            />
            <p className="text-[11px] text-slate-500">
              PNG, JPG, WEBP o SVG. Máximo 2 MB. Se sube automáticamente al servidor al presionar
              &ldquo;Guardar formato&rdquo;.
            </p>

            {hasCurrentLogo && !preview && (
              <label className="flex items-center gap-2 text-xs text-red-700">
                <input
                  type="checkbox"
                  name="removeLogo"
                  checked={removeCurrent}
                  onChange={(e) => setRemoveCurrent(e.target.checked)}
                />
                <Trash2 className="h-3.5 w-3.5" />
                <span>Eliminar logo actual al guardar</span>
              </label>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="encabezado">Encabezado (opcional)</Label>
        <textarea
          id="encabezado"
          name="encabezado"
          defaultValue={initial.encabezado}
          rows={3}
          maxLength={500}
          placeholder="Texto libre al inicio del comprobante"
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
