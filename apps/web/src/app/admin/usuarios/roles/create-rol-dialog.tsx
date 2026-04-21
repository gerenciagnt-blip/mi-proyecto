'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { ACCIONES, agruparModulos } from '@/lib/permisos';
import { createRolCustomAction, type ActionState } from './actions';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm text-brand-text-primary';

export function CreateRolCustomDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Crear rol personalizado</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Crear rol personalizado"
        description="Define el nombre, el rol base y marca los permisos del rol en un solo paso."
        size="xl"
      >
        <CreateRolForm onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function CreateRolForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createRolCustomAction,
    {},
  );
  const grupos = agruparModulos();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  return (
    <form ref={ref} action={action} className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Datos del rol</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" name="nombre" required placeholder="Supervisor" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              name="descripcion"
              placeholder="Qué hace este rol"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="basedOn">Basado en *</Label>
            <select
              id="basedOn"
              name="basedOn"
              required
              defaultValue="ALIADO_USER"
              className={selectClass}
            >
              <option value="ALIADO_OWNER">Dueño Aliado</option>
              <option value="ALIADO_USER">Usuario Aliado</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Permisos</h3>
          <p className="text-[11px] text-slate-500">
            Marca lo permitido · lo no marcado queda denegado
          </p>
        </div>

        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.grupo} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {g.grupo}
                </span>
                <BulkToggleButtons grupo={g.grupo} />
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-[11px] uppercase text-slate-400">
                  <tr>
                    <th className="w-1/2 px-4 py-2">Módulo</th>
                    {ACCIONES.map((a) => (
                      <th key={a} className="px-3 py-2 text-center">
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.modulos.map((m) => (
                    <tr key={m.key}>
                      <td className="px-4 py-2 font-medium text-slate-700">{m.label}</td>
                      {ACCIONES.map((a) => {
                        const name = `${m.key}::${a}`;
                        return (
                          <td key={a} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              name="perm"
                              value={name}
                              data-grupo={g.grupo}
                              className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/40"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Creando…' : 'Crear rol'}
        </Button>
      </div>
    </form>
  );
}

function BulkToggleButtons({ grupo }: { grupo: string }) {
  const setGrupo = (checked: boolean) => {
    const boxes = document.querySelectorAll<HTMLInputElement>(
      `input[name="perm"][data-grupo="${grupo}"]`,
    );
    boxes.forEach((b) => (b.checked = checked));
  };
  return (
    <div className="flex gap-2 text-[10px]">
      <button
        type="button"
        onClick={() => setGrupo(true)}
        className="rounded px-2 py-0.5 text-slate-500 hover:bg-white hover:text-slate-900"
      >
        Todos
      </button>
      <button
        type="button"
        onClick={() => setGrupo(false)}
        className="rounded px-2 py-0.5 text-slate-500 hover:bg-white hover:text-slate-900"
      >
        Ninguno
      </button>
    </div>
  );
}
