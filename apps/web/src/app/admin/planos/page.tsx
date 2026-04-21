import { FileSpreadsheet } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Planos — Sistema PILA' };

export default function PlanosPage() {
  return (
    <ComingSoon
      title="Planos"
      description="Generación automática de planillas cada 2 horas. Pestañas: Consolidado / Otros / Guardado / Pagadas. Pago masivo."
      icon={FileSpreadsheet}
    />
  );
}
