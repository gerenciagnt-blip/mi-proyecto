import Link from 'next/link';
import { prisma } from '@pila/db';
import { scopeWhereOpt, getUserScope } from '@/lib/sucursal-scope';
import { CreateMedioPagoForm } from './create-form';
import { toggleMedioPagoAction } from './actions';

export const metadata = { title: 'Medios de pago — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function MediosPagoPage() {
  const scope = await getUserScope();
  const where = await scopeWhereOpt();

  const [medios, sucursales] = await Promise.all([
    prisma.medioPago.findMany({
      where,
      orderBy: [{ sucursalId: 'asc' }, { codigo: 'asc' }],
      include: { sucursal: { select: { codigo: true, nombre: true } } },
    }),
    // Solo staff puede ver lista completa para asignar sucursal al crear
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
          Medios de pago
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Formas de pago reconocidas en el cuadre de caja.{' '}
          {esStaff
            ? 'Como staff puedes crear recursos globales (visibles por todas las sucursales) o asignarlos a una sucursal específica.'
            : 'Se listan los globales del sistema más los de tu sucursal.'}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nuevo medio de pago</h2>
        <CreateMedioPagoForm esStaff={esStaff} sucursales={sucursales} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {medios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay medios de pago
                </td>
              </tr>
            )}
            {medios.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-mono text-xs">{m.codigo}</td>
                <td className="px-4 py-3">{m.nombre}</td>
                <td className="px-4 py-3 text-xs">
                  {m.sucursal ? (
                    <span className="font-mono text-slate-600">
                      {m.sucursal.codigo}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                      Global
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {m.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleMedioPagoAction.bind(null, m.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {m.active ? 'Desactivar' : 'Activar'}
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
