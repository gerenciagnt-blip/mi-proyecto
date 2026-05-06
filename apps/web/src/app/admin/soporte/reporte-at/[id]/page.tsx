import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { ReporteAtDetalleCard } from '@/app/admin/administrativo/reporte-at/_components/detalle-card';
import { ReporteAtTimeline } from '@/app/admin/administrativo/reporte-at/_components/timeline';
import { CambiarEstadoReporteAtForm } from './cambiar-estado-form';

export const metadata = { title: 'Reporte AT · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ReporteAtDetalleSoportePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso('soporte.reporte_at');
  const { id } = await params;

  const reporte = await prisma.reporteAccidenteTrabajo.findUnique({
    where: { id },
    include: {
      sucursal: { select: { codigo: true, nombre: true } },
      gestiones: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          accionadaPor: true,
          nuevoEstado: true,
          descripcion: true,
          userName: true,
          createdAt: true,
        },
      },
    },
  });
  if (!reporte) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/soporte/reporte-at"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Reportes AT</span>
      </Link>

      <ReporteAtDetalleCard r={reporte} />

      <CambiarEstadoReporteAtForm reporteId={reporte.id} estadoActual={reporte.estado} />

      <ReporteAtTimeline
        reporteId={reporte.id}
        gestiones={reporte.gestiones}
        permitirNotaAliado={false}
      />
    </div>
  );
}
