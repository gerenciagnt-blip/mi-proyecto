import { prisma } from '@pila/db';
import { CreateCuentaCobroForm } from './create-form';
import { toggleCuentaCobroAction } from './actions';

export const metadata = { title: 'Cuentas de cobro — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function CuentasCobroPage() {
  const [cuentas, sucursales] = await Promise.all([
    prisma.cuentaCobro.findMany({
      orderBy: [{ sucursal: { codigo: 'asc' } }, { codigo: 'asc' }],
      include: { sucursal: { select: { codigo: true, nombre: true } } },
    }),
    prisma.sucursal.findMany({
      where: { active: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Cuentas de cobro
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Empresas empleadoras — agrupadores para facturación masiva dentro de una sucursal.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Crear nueva cuenta de cobro</h2>
        <CreateCuentaCobroForm sucursales={sucursales} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Razón social</th>
              <th className="px-4 py-2">NIT</th>
              <th className="px-4 py-2">Ciudad</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aún no hay cuentas de cobro
                </td>
              </tr>
            )}
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.sucursal.codigo}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                <td className="px-4 py-3">{c.razonSocial}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {c.nit ? `${c.nit}${c.dv ? '-' + c.dv : ''}` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{c.ciudad ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {c.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleCuentaCobroAction.bind(null, c.id)}>
                    <button
                      type="submit"
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      {c.active ? 'Desactivar' : 'Activar'}
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
