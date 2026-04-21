import { FolderArchive } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Base de datos — Sistema PILA' };

export default function BaseDatosPage() {
  return (
    <ComingSoon
      title="Base de datos (Afiliaciones)"
      description="Cotizantes (clientes afiliados) por empresa. Separación Activos / Inactivos, formulario mejorado con selección por plan SGSS, bitácora transversal."
      icon={FolderArchive}
    />
  );
}
