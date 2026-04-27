'use client';

/**
 * Select pequeño que filtra los jobs por empresa, auto-submit al cambiar.
 * Se extrae a Client Component porque Next 15 no permite `onChange`
 * (event handler) directamente en un Server Component (la página
 * `colpatria-jobs/page.tsx` es async server-rendered).
 */
export function EmpresaFilter({
  empresas,
  defaultEmpresaId,
  statusActual,
}: {
  empresas: Array<{ id: string; nit: string; nombre: string }>;
  defaultEmpresaId: string;
  statusActual: string;
}) {
  return (
    <form method="GET" action="/admin/configuracion/colpatria-jobs">
      <input type="hidden" name="status" value={statusActual} />
      <select
        name="empresaId"
        defaultValue={defaultEmpresaId}
        onChange={(e) => e.currentTarget.form?.submit()}
        className="h-8 min-w-[260px] rounded-md border border-slate-300 bg-white px-2 text-xs"
      >
        <option value="">Todas las empresas</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nit} — {e.nombre}
          </option>
        ))}
      </select>
    </form>
  );
}
