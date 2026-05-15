import { auth } from '@/auth';
import { SectionTabs } from './section-tabs';

export default async function TransaccionesLayout({ children }: { children: React.ReactNode }) {
  // Sprint Asesor — el rol ASESOR_COMERCIAL solo ve las tabs filtradas
  // (Historial + Cartera de cotizantes). Las tabs Transacción (crear)
  // y Cuadre de caja se ocultan.
  const session = await auth();
  const esAsesor = session?.user.role === 'ASESOR_COMERCIAL';
  return (
    <div className="space-y-6">
      <SectionTabs esAsesor={esAsesor} />
      {children}
    </div>
  );
}
