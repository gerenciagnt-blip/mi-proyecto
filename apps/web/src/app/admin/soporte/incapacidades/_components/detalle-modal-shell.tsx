'use client';

/**
 * Wrapper client-side que renderiza el detalle dentro de un Dialog
 * controlado. El modal se cierra navegando hacia atrás (`router.back()`),
 * lo que descarta el slot @modal y vuelve a mostrar la lista pura.
 *
 * Uso desde el route intercept `@modal/(.)[id]/page.tsx`.
 */

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';

export function DetalleModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onClose={() => router.back()} size="xl">
      {children}
    </Dialog>
  );
}
