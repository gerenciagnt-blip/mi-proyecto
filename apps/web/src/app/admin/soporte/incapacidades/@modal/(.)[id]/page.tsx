/**
 * Intercepting Route — `(.)[id]` intercepta la navegación a
 * `/admin/soporte/incapacidades/[id]` cuando viene desde la lista (mismo
 * nivel) y la renderiza dentro del slot `@modal`. La URL en el browser
 * cambia, pero la página de lista permanece detrás. Refresh / acceso
 * directo cae al `[id]/page.tsx` normal (no este archivo).
 */

import { requirePermiso } from '@/lib/auth-helpers';
import { DetalleModalShell } from '../../_components/detalle-modal-shell';
import { IncapacidadDetalleContent } from '../../_components/incapacidad-detalle-content';

export const dynamic = 'force-dynamic';

export default async function IncapacidadDetalleModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso('soporte.incapacidades');
  const { id } = await params;
  return (
    <DetalleModalShell>
      <IncapacidadDetalleContent id={id} />
    </DetalleModalShell>
  );
}
