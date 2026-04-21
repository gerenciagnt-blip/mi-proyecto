import { ArrowRightLeft } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Transacciones — Sistema PILA' };

export default function TransaccionesPage() {
  return (
    <ComingSoon
      title="Transacciones"
      description="Comprobantes de pago: individual, cuenta de cobro, freelance. Pasarela de pago, integración contable, cuadre de caja con anulaciones."
      icon={ArrowRightLeft}
    />
  );
}
