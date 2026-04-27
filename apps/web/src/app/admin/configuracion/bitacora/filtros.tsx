'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Formulario de filtros de la bitácora. Es un Client Component porque
 * los selects deben hacer auto-submit al cambiar y necesitamos manejar
 * los searchParams reactivamente.
 *
 * Estrategia: cada control llama `aplicar(patch)` que reescribe los
 * searchParams preservando el resto. La página se re-renderiza con los
 * nuevos filtros vía `router.replace`.
 */
export function BitacoraFiltros({
  entidades,
  acciones,
  usuarios,
}: {
  /** Lista de valores únicos de `entidad` ya presentes en la bitácora. */
  entidades: string[];
  /** Lista de valores únicos de `accion` ya presentes en la bitácora. */
  acciones: string[];
  /** Usuarios que han generado al menos un evento (para el filtro). */
  usuarios: { id: string; name: string }[];
}) {
  const router = useRouter();
  const spRaw = useSearchParams();
  const sp = spRaw ?? new URLSearchParams();
  const [pending, startTransition] = useTransition();

  // Patch builder — aplica `patch` sobre los searchParams actuales,
  // borrando claves cuyo valor sea ''.
  function aplicar(patch: Record<string, string>) {
    const nuevos = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) nuevos.set(k, v);
      else nuevos.delete(k);
    }
    // Reseteamos paginación cada vez que cambia un filtro.
    if (!('page' in patch)) nuevos.delete('page');
    startTransition(() => {
      router.replace(`?${nuevos.toString()}`);
    });
  }

  function limpiarTodo() {
    startTransition(() => {
      router.replace('?');
    });
  }

  const q = sp.get('q') ?? '';
  const entidad = sp.get('entidad') ?? '';
  const accion = sp.get('accion') ?? '';
  const userId = sp.get('userId') ?? '';
  const documento = sp.get('documento') ?? '';
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';

  const hayFiltros = Boolean(q || entidad || accion || userId || documento || desde || hasta);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <div className="flex flex-wrap items-end gap-3">
        {/* Búsqueda libre */}
        <label className="flex flex-1 flex-col gap-1 min-w-[220px]">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Buscar</span>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Descripción, ID, usuario..."
              defaultValue={q}
              onChange={(e) => {
                // Debounce simple — espera que el usuario deje de tipear.
                const valor = e.currentTarget.value;
                clearTimeout((window as unknown as { __auditDebounce?: number }).__auditDebounce);
                (window as unknown as { __auditDebounce?: number }).__auditDebounce =
                  window.setTimeout(() => aplicar({ q: valor }), 350);
              }}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 text-xs"
            />
          </div>
        </label>

        {/* Entidad */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Entidad</span>
          <select
            value={entidad}
            onChange={(e) => aplicar({ entidad: e.currentTarget.value })}
            className="h-9 min-w-[150px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">Todas</option>
            {entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        {/* Acción */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Acción</span>
          <select
            value={accion}
            onChange={(e) => aplicar({ accion: e.currentTarget.value })}
            className="h-9 min-w-[120px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">Todas</option>
            {acciones.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        {/* Usuario */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Usuario</span>
          <select
            value={userId}
            onChange={(e) => aplicar({ userId: e.currentTarget.value })}
            className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        {/* Documento del cotizante — filtra eventos sobre Cotizante o
             Afiliacion cuyo cotizante tiene ese número de documento. */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Documento</span>
          <input
            type="text"
            placeholder="Ej. 1088016550"
            defaultValue={documento}
            maxLength={20}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v !== documento) aplicar({ documento: v });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="h-9 w-36 rounded-lg border border-slate-300 bg-white px-2 text-xs"
          />
        </label>

        {/* Rango de fechas */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => aplicar({ desde: e.currentTarget.value })}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => aplicar({ hasta: e.currentTarget.value })}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
          />
        </label>

        {hayFiltros && (
          <button
            type="button"
            onClick={limpiarTodo}
            disabled={pending}
            className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-white"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>
    </section>
  );
}
