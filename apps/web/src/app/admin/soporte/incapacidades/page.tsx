import { FileText } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Soporte · Incapacidades — Sistema PILA' };

export default function SoporteIncapacidadesPage() {
  return (
    <ComingSoon
      title="Soporte · Incapacidades"
      description="Incapacidades radicadas por aliados. Control de tesorería: identificar pagos, asignar al usuario, desembolsar."
      icon={FileText}
      backHref="/admin/soporte"
      backLabel="Soporte"
    />
  );
}
