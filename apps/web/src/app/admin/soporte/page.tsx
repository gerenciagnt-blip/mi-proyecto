import { LifeBuoy } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Soporte — Sistema PILA' };

export default function SoportePage() {
  return (
    <ComingSoon
      title="Soporte"
      description="Centraliza las peticiones de afiliación e incapacidades que suben los aliados. Aquí las procesas como staff de la plataforma."
      icon={LifeBuoy}
    />
  );
}
