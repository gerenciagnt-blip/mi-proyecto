import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import { RadicarReporteAtForm } from './radicar-form';

export const metadata = { title: 'Radicar Reporte AT — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function ReporteAtNuevoPage() {
  const session = await requirePermiso('admin.reporte_at');
  const scope = await getUserScope();

  // Si es staff, dejamos elegir sucursal; si es aliado, la heredamos.
  const sucursales =
    scope?.tipo === 'STAFF'
      ? await prisma.sucursal.findMany({
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];

  const sucursalIdActual = scope?.tipo === 'SUCURSAL' ? scope.sucursalId : null;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/administrativo/reporte-at"
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Reportes AT</span>
      </Link>

      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <ClipboardList className="h-6 w-6 text-brand-blue" />
          Radicar reporte de accidente / incidente de trabajo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Diligencia los datos del trabajador y describe el evento. Soporte recibirá la radicación
          con el consecutivo asignado.
        </p>
      </header>

      <RadicarReporteAtForm
        sucursales={sucursales}
        sucursalIdActual={sucursalIdActual}
        elaboradoPorDefault={{
          nombre: session.user.name,
          correo: session.user.email,
        }}
      />
    </div>
  );
}
