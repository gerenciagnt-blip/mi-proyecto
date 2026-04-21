'use client';

import { useActionState, useMemo } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { ACCIONES, agruparModulos } from '@/lib/permisos';
import {
  updateRolCustomAction,
  deleteRolCustomAction,
  type ActionState,
} from '../actions';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm text-brand-text-primary';

type Props = {
  rolId: string;
  initial: {
    nombre: string;
    descripcion: string;
    basedOn: 'ALIADO_OWNER' | 'ALIADO_USER';
    granted: string[]; // ['modulo::accion']
  };
};

export function EditRolCustomForm({ rolId, initial }: Props) {
  const bound = updateRolCustomAction.bind(null, rolId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const grantedSet = useMemo(() => new Set(initial.granted), [initial.granted]);
  const grupos = useMemo(() => agruparModulos(), []);

  const keyFor = (m: string, a: string) => `${m}::${a}`;

  return (
    <form action={action} className="space-y-6">
      {/* Datos básicos */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Datos del rol</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required defaultValue={initial.nombre} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              name="descripcion"
              defaultValue={initial.descripcion}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="basedOn">Basado en</Label>
            <select
              id="basedOn"
              name="basedOn"
              defaultValue={initial.basedOn}
              className={selectClass}
            >
              <option value="ALIADO_OWNER">Dueño Aliado</option>
              <option value="ALIADO_USER">Usuario Aliado</option>
            </select>
          </div>
        </div>
      </section>

      {/* Matriz permisos */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Permisos por módulo</h3>
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.grupo} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {g.grupo}
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
                      <td className="px-4 py-2.5 font-medium text-slate-700">{m.label}</td>
                      {ACCIONES.map((a) => {
                        const name = keyFor(m.key, a);
                        return (
                          <td key={a} className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              name="perm"
                              value={name}
                              defaultChecked={grantedSet.has(name)}
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

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && <Alert variant="success">Rol guardado</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Eliminar rol — fuera del form principal */}
      <DeleteButton rolId={rolId} />
    </form>
  );
}

function DeleteButton({ rolId }: { rolId: string }) {
  // Form separado para el delete (no queremos que un submit accidental llame al delete)
  return (
    <div className="pt-4">
      <form action={deleteRolCustomAction.bind(null, rolId)}>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          <span>Eliminar rol</span>
        </button>
      </form>
      <p className="mt-1 text-[11px] text-slate-400">
        Acción irreversible. Elimina el rol y todos sus permisos.
      </p>
    </div>
  );
}
