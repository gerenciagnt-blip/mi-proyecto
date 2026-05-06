import { requirePermiso } from '@/lib/auth-helpers';
import { DetalleModalShell } from '../../_components/detalle-modal-shell';
import { JuridicoDetalleContent } from '../../_components/juridico-detalle-content';

export const dynamic = 'force-dynamic';

export default async function JuridicoDetalleModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso('soporte.juridico');
  const { id } = await params;
  return (
    <DetalleModalShell>
      <JuridicoDetalleContent id={id} />
    </DetalleModalShell>
  );
}
