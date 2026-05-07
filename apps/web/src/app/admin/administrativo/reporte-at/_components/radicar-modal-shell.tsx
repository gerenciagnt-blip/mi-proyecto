'use client';

/**
 * Wrapper client-side que renderiza el formulario de radicación dentro
 * de un Dialog controlado. Al cerrar, navega explícitamente a la URL
 * de la lista para evitar el bug de `router.back()` con parallel +
 * intercepting routes en Next 15.1.3 (initialTree iterable).
 *
 * onSuccess se pasa al form: cuando radica exitosamente, cerramos el
 * modal y refrescamos la lista de fondo para que aparezca la nueva
 * fila.
 */

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { RadicarReporteAtForm } from '../nuevo/radicar-form';

const URL_LISTA = '/admin/administrativo/reporte-at';

type Sucursal = { id: string; codigo: string; nombre: string };

export function RadicarModalShell({
  sucursales,
  sucursalIdActual,
  elaboradoPorDefault,
}: {
  sucursales: Sucursal[];
  sucursalIdActual: string | null;
  elaboradoPorDefault: { nombre: string; correo: string };
}) {
  const router = useRouter();
  const cerrar = () => router.push(URL_LISTA);

  return (
    <Dialog
      open
      onClose={cerrar}
      size="xl"
      title="Radicar reporte de accidente / incidente de trabajo"
      description="Diligencia los datos del trabajador y describe el evento. Soporte recibirá la radicación con el consecutivo asignado."
    >
      <div className="max-h-[75vh] overflow-y-auto p-5">
        <RadicarReporteAtForm
          sucursales={sucursales}
          sucursalIdActual={sucursalIdActual}
          elaboradoPorDefault={elaboradoPorDefault}
          onSuccess={() => {
            router.push(URL_LISTA);
            router.refresh();
          }}
        />
      </div>
    </Dialog>
  );
}
