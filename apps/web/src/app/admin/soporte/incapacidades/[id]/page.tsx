import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { IncapacidadDetalleContent } from '../_components/incapacidad-detalle-content';

export const metadata = { title: 'Incapacidad · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function IncapacidadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/admin/soporte/incapacidades"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Incapacidades</span>
      </Link>
      <IncapacidadDetalleContent id={id} />
    </div>
  );
}
