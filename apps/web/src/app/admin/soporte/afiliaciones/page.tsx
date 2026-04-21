import { FileCheck } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Soporte · Afiliaciones — Sistema PILA' };

export default function SoporteAfiliacionesPage() {
  return (
    <ComingSoon
      title="Soporte · Afiliaciones"
      description="Peticiones de afiliación enviadas por aliados. Pestañas pendiente / en proceso / procesado."
      icon={FileCheck}
      backHref="/admin/soporte"
      backLabel="Soporte"
    />
  );
}
