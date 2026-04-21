'use client';

import { useActionState, useMemo } from 'react';
import { Save } from 'lucide-react';
import type { Role } from '@pila/db';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ACCIONES, agruparModulos } from '@/lib/permisos';
import { savePermisosAction, type ActionState } from './actions';

type Props = {
  role: Exclude<Role, 'ADMIN'>;
  roleLabel: string;
  granted: string[]; // ['modulo::accion', ...]
};

export function PermisosForm({ role, roleLabel, granted }: Props) {
  const bound = savePermisosAction.bind(null, role);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const grupos = useMemo(() => agruparModulos(), []);

  const keyFor = (modulo: string, accion: string) => `${modulo}::${accion}`;

  return (
    <form action={action} className="space-y-5">
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

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && <Alert variant="success">Permisos de {roleLabel} actualizados</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Marca lo permitido; lo no marcado queda denegado.
        </p>
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Guardando…' : `Guardar ${roleLabel}`}
        </Button>
      </div>
    </form>
  );
}
