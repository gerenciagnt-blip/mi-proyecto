'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, MapPin } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  actualizarCentrosTrabajoAction,
  type ActionState,
  type CentroTrabajoMapeo,
} from './actions';

/**
 * Form para mapear cada nivel de riesgo permitido de la empresa a un
 * código de Centro de Trabajo en Colpatria.
 *
 * El listado de niveles viene de `EmpresaNivelRiesgo` — si la empresa
 * no tiene niveles configurados, mostramos un CTA para ir a la
 * Configuración PILA primero.
 */
export function CentrosTrabajoForm({
  empresaId,
  niveles,
}: {
  empresaId: string;
  niveles: CentroTrabajoMapeo[];
}) {
  const bound = actualizarCentrosTrabajoAction.bind(null, empresaId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  if (niveles.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs">
        <p className="flex items-center gap-2 font-medium text-amber-900">
          <AlertCircle className="h-4 w-4" />
          Esta empresa no tiene niveles de riesgo configurados.
        </p>
        <p className="mt-1 text-amber-800">
          Antes de mapear centros de trabajo Colpatria, configura los niveles permitidos en{' '}
          <Link
            href={`/admin/empresas/${empresaId}/config`}
            className="font-medium underline hover:text-amber-900"
          >
            Configuración PILA
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <header>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-brand-blue" />
          Centro de trabajo por nivel de riesgo
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          El bot decide a qué Centro de Trabajo en Colpatria asignar cada cotizante según su nivel
          de riesgo. Si dejas un nivel vacío, el bot usa la sucursal default.
        </p>
      </header>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-24 px-3 py-2 text-left font-medium">Nivel</th>
              <th className="px-3 py-2 text-left font-medium">Código de Centro de Trabajo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {niveles.map((n) => (
              <tr key={n.nivel}>
                <td className="px-3 py-2">
                  <span className="rounded bg-brand-blue/10 px-2 py-0.5 font-mono font-semibold text-brand-blue-dark">
                    {n.nivel}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    name={`centro_${n.nivel}`}
                    defaultValue={n.colpatriaCentroTrabajo ?? ''}
                    placeholder="ej. 03"
                    className="h-8 w-32 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs focus:border-brand-blue focus:outline-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Mapeo guardado correctamente.</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar mapeo'}
        </Button>
      </div>
    </form>
  );
}
