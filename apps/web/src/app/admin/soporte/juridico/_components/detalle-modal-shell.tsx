'use client';

/**
 * Ver explicación detallada en `soporte/incapacidades/_components/detalle-modal-shell.tsx`.
 * Mismo patrón aplicado acá para evitar el bug de Next 15.1.3 con
 * parallel + intercepting routes.
 */

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';

const URL_LISTA = '/admin/soporte/juridico';

export function DetalleModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onClose={() => router.push(URL_LISTA)} size="xl">
      {children}
    </Dialog>
  );
}
