import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { ReporteAtDetalleCard } from '../_components/detalle-card';
import { ReporteAtTimeline } from '../_components/timeline';

export const metadata = { title: 'Reporte AT · Detalle — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ReporteAtDetalleAdministrativoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso('admin.reporte_at');
  const { id } = await params;
  const scope = await getUserScope();
  if (!scope) notFound();

  const reporte = await prisma.reporteAccidenteTrabajo.findUnique({
    where: { id },
    include: {
      sucursal: { select: { codigo: true, nombre: true } },
      // Sprint Asesor — incluimos las afiliaciones del cotizante para
      // validar (cuando rol=ASESOR) que al menos una tiene su asesorId.
      cotizante: {
        select: {
          id: true,
          afiliaciones: { select: { asesorComercialId: true } },
        },
      },
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
  if (
    (scope.tipo === 'SUCURSAL' || scope.tipo === 'ASESOR') &&
    reporte.sucursalId !== scope.sucursalId
  ) {
    notFound();
  }
  // Sprint Asesor — el asesor solo accede a reportes cuyo cotizante
  // tenga al menos una afiliación con su asesorComercialId. Reportes
  // sin cotizante linkeado o de otros asesores son not-found.
  if (scope.tipo === 'ASESOR') {
    const matchAsesor =
      reporte.cotizante?.afiliaciones.some(
        (a) => a.asesorComercialId === scope.asesorComercialId,
      ) ?? false;
    if (!matchAsesor) notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/administrativo/reporte-at"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Reportes AT</span>
      </Link>

      <ReporteAtDetalleCard r={reporte} />

      <ReporteAtTimeline reporteId={reporte.id} gestiones={reporte.gestiones} permitirNotaAliado />
    </div>
  );
}
