'use client';

/**
 * Wrapper client-side que renderiza el detalle dentro de un Dialog
 * controlado. Al cerrar, navega explícitamente a la URL de la lista en
 * lugar de hacer `router.back()`.
 *
 * Por qué `push` y no `back`: Next 15.1.3 tiene un bug conocido con
 * parallel + intercepting routes donde `router.back()` desde un slot
 * interceptado puede tirar `TypeError: initialTree is not iterable`
 * (ver vercel/next.js issue #72541). `router.push(URL_LISTA)` hace una
 * navegación forward limpia que reconstruye el árbol del router desde
 * cero y evita el state corrupto.
 *
 * Trade-off: en lugar de "cerrar modal y mantener historial", esto
 * empuja una entrada nueva al history. El usuario puede volver con el
 * botón atrás del browser. Aceptable hasta que actualicemos Next a una
 * versión con el fix oficial.
 */

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';

const URL_LISTA = '/admin/soporte/incapacidades';

export function DetalleModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onClose={() => router.push(URL_LISTA)} size="xl">
      {children}
    </Dialog>
  );
}
