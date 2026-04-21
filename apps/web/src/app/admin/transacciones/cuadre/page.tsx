import { Calculator } from 'lucide-react';
import { ComingSoon } from '@/components/admin/coming-soon';

export const metadata = { title: 'Cuadre de caja — Sistema PILA' };

export default function CuadreCajaPage() {
  return (
    <ComingSoon
      title="Cuadre de caja"
      description="Conciliación diaria de pagos recibidos por medio de pago, con anulaciones y reporte por sucursal. En preparación."
      icon={Calculator}
    />
  );
}
