import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaff } from '@/lib/auth-helpers';
import { JuridicoDetalleContent } from '../_components/juridico-detalle-content';

export const metadata = { title: 'Caso jurídico · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function JuridicoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/admin/soporte/juridico"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3 w-3" />
        Volver a la bandeja jurídico
      </Link>
      <JuridicoDetalleContent id={id} />
    </div>
  );
}
