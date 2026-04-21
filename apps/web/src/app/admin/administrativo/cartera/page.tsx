import { Wallet } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Cartera — Sistema PILA' };

export default function CarteraPage() {
  return (
    <ComingSoon
      title="Administrativo · Cartera"
      description="Carga de carteras desde entidades SGSS. Depuración, seguimiento y asignación a usuarios."
      icon={Wallet}
      backHref="/admin/administrativo"
      backLabel="Administrativo"
    />
  );
}
