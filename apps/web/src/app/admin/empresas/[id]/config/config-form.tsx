'use client';

import { useActionState, useEffect, useState } from 'react';
import { updateEmpresaConfigAction, type ActionState } from './actions';
import type { NivelRiesgo } from '@pila/db';

type Actividad = { id: string; codigoCiiu: string; descripcion: string };
type Subtipo = { id: string; codigo: string; nombre: string };
type TipoCotizante = {
  id: string;
  codigo: string;
  nombre: string;
  subtipos: Subtipo[];
};

const NIVELES: NivelRiesgo[] = ['I', 'II', 'III', 'IV', 'V'];

export function ConfigForm({
  empresaId,
  actividades,
  tipos,
  selectedNiveles,
  selectedActividades,
  selectedTipos,
  selectedSubtipos,
  onSuccess,
}: {
  empresaId: string;
  actividades: Actividad[];
  tipos: TipoCotizante[];
  selectedNiveles: NivelRiesgo[];
  selectedActividades: string[];
  selectedTipos: string[];
  selectedSubtipos: string[];
  /** Sprint reorg — modal con tabs invoca esto tras submit OK para
   *  refrescar el snapshot de completitud. */
  onSuccess?: () => void;
}) {
  const bound = updateEmpresaConfigAction.bind(null, empresaId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  const [tiposSel, setTiposSel] = useState(new Set(selectedTipos));
  const [actFilter, setActFilter] = useState('');

  useEffect(() => {
    if (state.ok) onSuccess?.();
  }, [state.ok, onSuccess]);

  const toggleTipo = (id: string, checked: boolean) => {
    setTiposSel((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const actividadesVisible = actividades.filter((a) => {
    const q = actFilter.toLowerCase();
    return !q || a.codigoCiiu.includes(q) || a.descripcion.toLowerCase().includes(q);
  });

  return (
    <form action={action} className="space-y-4">
      {/* Niveles de riesgo */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Niveles de riesgo ARL permitidos</h3>
        <div className="flex flex-wrap gap-3">
          {NIVELES.map((n) => (
            <label
              key={n}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                name="nivel"
                value={n}
                defaultChecked={selectedNiveles.includes(n)}
              />
              <span className="font-mono">{n}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Actividades */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Actividades económicas permitidas
          <span className="ml-2 text-xs font-normal text-slate-500">
            (adicionales al CIIU principal)
          </span>
        </h3>
        <input
          type="search"
          placeholder="Buscar por CIIU o descripción..."
          value={actFilter}
          onChange={(e) => setActFilter(e.target.value)}
          className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
          {actividades.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              No hay actividades en el catálogo
            </p>
          )}
          {actividades.length > 0 && actividadesVisible.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados</p>
          )}
          <ul className="divide-y divide-slate-100">
            {actividadesVisible.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="actividadId"
                  value={a.id}
                  id={`act-${a.id}`}
                  defaultChecked={selectedActividades.includes(a.id)}
                />
                <label htmlFor={`act-${a.id}`} className="flex-1 cursor-pointer text-sm">
                  <span className="font-mono text-xs text-slate-500">{a.codigoCiiu}</span>
                  <span className="ml-3">{a.descripcion}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tipos y subtipos cotizante */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Tipos y subtipos de cotizante permitidos
          <span className="ml-2 text-xs font-normal text-slate-500">
            (subtipos se habilitan cuando marcas su tipo padre)
          </span>
        </h3>
        {tipos.length === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No hay tipos de cotizante en el catálogo — agrégalos en /admin/catalogos/tipos-cotizante
          </p>
        )}
        <div className="space-y-3">
          {tipos.map((t) => {
            const tipoChecked = tiposSel.has(t.id);
            return (
              <div key={t.id} className="rounded-md border border-slate-200">
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="tipoId"
                    value={t.id}
                    checked={tipoChecked}
                    onChange={(e) => toggleTipo(t.id, e.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="font-mono text-xs text-slate-500">{t.codigo}</span>
                    <span className="ml-3 font-medium">{t.nombre}</span>
                  </span>
                </label>
                {tipoChecked && t.subtipos.length > 0 && (
                  <ul className="border-t border-slate-100 bg-slate-50 px-4 py-2">
                    {t.subtipos.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-1">
                        <input
                          type="checkbox"
                          name="subtipoId"
                          value={s.id}
                          id={`sub-${s.id}`}
                          defaultChecked={selectedSubtipos.includes(s.id)}
                        />
                        <label htmlFor={`sub-${s.id}`} className="cursor-pointer text-xs">
                          <span className="font-mono text-slate-500">{s.codigo}</span>
                          <span className="ml-3">{s.nombre}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {tipoChecked && t.subtipos.length === 0 && (
                  <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    Este tipo no tiene subtipos en el catálogo.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Configuración PILA actualizada
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-blue px-6 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </form>
  );
}
