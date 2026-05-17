import Link from 'next/link';
import { prisma } from '@pila/db';
import { requirePermiso } from '@/lib/auth-helpers';
import { scopeWhereOpt, getUserScope } from '@/lib/sucursal-scope';
import { CreateAsesorForm } from './create-form';
import { toggleAsesorAction } from './actions';
import { CrearLoginButton } from './crear-login-button';
import { EditComisionButton } from './edit-comision-button';

function formatoCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

export const metadata = { title: 'Asesores comerciales — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function AsesoresPage() {
  await requirePermiso('config.asesores_comerciales');
  const scope = await getUserScope();
  const where = await scopeWhereOpt();

  const [asesores, sucursales] = await Promise.all([
    prisma.asesorComercial.findMany({
      where,
      orderBy: [{ sucursalId: 'asc' }, { codigo: 'asc' }],
      include: {
        sucursal: { select: { codigo: true, nombre: true } },
        // Sprint Asesor Comercial — para mostrar el chip "Con login" y
        // ocultar el botón "Crear login" cuando ya existe el User asociado.
        user: { select: { id: true, email: true, active: true } },
      },
      // Aseguramos que se carguen los nuevos campos generaComision + metaMensual
      // (vienen por defecto al no usar `select`).
    }),
    scope?.tipo === 'STAFF'
      ? prisma.sucursal.findMany({
          where: { active: true },
          orderBy: { codigo: 'asc' },
          select: { id: true, codigo: true, nombre: true },
        })
      : Promise.resolve([]),
  ]);

  const esStaff = scope?.tipo === 'STAFF';

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/catalogos" className="text-sm text-slate-500 hover:text-slate-900">
          ← Parametrización
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Asesores comerciales
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Personas que generan la venta. Se anclan al cotizante al momento de crearlo.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo asesor</h2>
        <CreateAsesorForm esStaff={esStaff} sucursales={sucursales} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Login</th>
              <th className="px-4 py-2">Comisión</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asesores.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay asesores
                </td>
              </tr>
            )}
            {asesores.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">{a.codigo}</td>
                <td className="px-4 py-3">{a.nombre}</td>
                <td className="px-4 py-3 text-xs">
                  {a.sucursal ? (
                    <span className="font-mono text-slate-600">{a.sucursal.codigo}</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                      Global
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.email ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.telefono ?? '—'}</td>
                <td className="px-4 py-3 text-xs">
                  {a.user ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        a.user.active
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }`}
                      title={a.user.email}
                    >
                      {a.user.active ? '🟢 Con login' : '⚪ Login inactivo'}
                    </span>
                  ) : esStaff ? (
                    <CrearLoginButton asesorId={a.id} />
                  ) : (
                    <span className="text-[10px] text-slate-400">Sin login</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {a.generaComision ? (
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Genera · {a.metaMensual ? formatoCOP(Number(a.metaMensual)) : '—'}
                      </span>
                      <div>
                        <EditComisionButton
                          asesorId={a.id}
                          asesorCodigo={a.codigo}
                          asesorNombre={a.nombre}
                          generaComision={a.generaComision}
                          metaMensual={a.metaMensual ? Number(a.metaMensual) : null}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                        No genera
                      </span>
                      <div>
                        <EditComisionButton
                          asesorId={a.id}
                          asesorCodigo={a.codigo}
                          asesorNombre={a.nombre}
                          generaComision={a.generaComision}
                          metaMensual={a.metaMensual ? Number(a.metaMensual) : null}
                        />
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {a.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleAsesorAction.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {a.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
