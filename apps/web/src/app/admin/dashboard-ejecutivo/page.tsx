import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Sprint reorg 2026-04-27 — el dashboard ejecutivo se fusionó con
 * `/admin` (Inicio). Esta ruta queda como redirect permanente para
 * no romper bookmarks ni links viejos en emails. Los componentes
 * (KpiCard, AutoSubmitSelect, AlertasInactividadSection) viven en
 * este directorio y son importados desde `/admin/page.tsx`.
 */
export default async function DashboardEjecutivoRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Preservamos los query params (sucursalId, anio, mes) al redirigir.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const tail = qs.toString();
  redirect(`/admin${tail ? `?${tail}` : ''}`);
}
