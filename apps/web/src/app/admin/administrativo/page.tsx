import { Briefcase } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Administrativo — Sistema PILA' };

export default function AdministrativoPage() {
  return (
    <ComingSoon
      title="Administrativo"
      description="Cartera de entidades SGSS e incapacidades desde la perspectiva administrativa."
      icon={Briefcase}
    />
  );
}
