import { FileText } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Incapacidades — Sistema PILA' };

export default function AdminIncapacidadesPage() {
  return (
    <ComingSoon
      title="Administrativo · Incapacidades"
      description="Gestión administrativa de incapacidades, pagos y desembolsos."
      icon={FileText}
      backHref="/admin/administrativo"
      backLabel="Administrativo"
    />
  );
}
