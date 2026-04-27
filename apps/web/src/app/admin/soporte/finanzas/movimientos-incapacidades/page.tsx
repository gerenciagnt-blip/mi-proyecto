import Link from 'next/link';
import { ArrowLeft, Landmark, AlertCircle } from 'lucide-react';
import type { MovimientoIncEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatCOP } from '@/lib/format';
import { UploadExtractoButton } from './upload-form';
import { RegistroManualButton } from './manual-dialog';
import { AsignarEmpresaCell } from './asignar-empresa-cell';

export const metadata = { title: 'Movimientos Incapacidades · Finanzas' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  banco?: string;
  q?: string;
  desde?: string;
  hasta?: string;
};

const ESTADO_LABEL: Record<MovimientoIncEstado, string> = {
  PENDIENTE: 'Pendiente',
  CONCILIADO: 'Conciliado',
  ANULADO: 'Anulado',
};
const ESTADO_TONE: Record<MovimientoIncEstado, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONCILIADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ANULADO: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function defaultDesde() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}
function defaultHasta() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;

  const estadoFilter: MovimientoIncEstado | undefined =
    sp.estado === 'PENDIENTE' || sp.estado === 'CONCILIADO' || sp.estado === 'ANULADO'
      ? (sp.estado as MovimientoIncEstado)
      : undefined;
  const banco = sp.banco?.trim() ?? '';
  const q = sp.q?.trim() ?? '';
  const desde = sp.desde ?? defaultDesde();
  const hasta = sp.hasta ?? defaultHasta();

  const where: Prisma.MovimientoIncapacidadWhereInput = {};
  if (estadoFilter) where.estado = estadoFilter;
  if (banco) where.bancoOrigen = { contains: banco, mode: 'insensitive' };
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { concepto: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (desde || hasta) {
    where.fechaIngreso = {};
    if (desde) where.fechaIngreso.gte = new Date(desde + 'T00:00:00');
    if (hasta) where.fechaIngreso.lte = new Date(hasta + 'T23:59:59');
  }

  const [movimientos, statsByEstado, bancos, entidades, empresas] = await Promise.all([
    prisma.movimientoIncapacidad.findMany({
      where,
      orderBy: { fechaIngreso: 'desc' },
      take: 300,
      include: {
        empresa: { select: { id: true, nombre: true, nit: true } },
        entidadSgss: { select: { id: true, codigo: true, nombre: true, tipo: true } },
        _count: { select: { detalles: true } },
      },
    }),
    prisma.movimientoIncapacidad.groupBy({
      by: ['estado'],
      where,
      _count: { _all: true },
      _sum: { valor: true },
    }),
    prisma.movimientoIncapacidad.findMany({
      where: { bancoOrigen: { not: null } },
      distinct: ['bancoOrigen'],
      orderBy: { bancoOrigen: 'asc' },
      select: { bancoOrigen: true },
    }),
    // Sprint Soporte reorg — entidades EPS+ARL para el autocomplete del
    // modal "Registro manual". Solo activas, ordenadas por nombre.
    prisma.entidadSgss.findMany({
      where: { active: true, tipo: { in: ['EPS', 'ARL'] } },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      select: { id: true, codigo: true, nombre: true, tipo: true },
    }),
    // Empresas para el selector inline + el modal manual.
    prisma.empresa.findMany({
      where: { active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true },
    }),
  ]);

  const counts = new Map<MovimientoIncEstado, { n: number; total: number }>();
  for (const r of statsByEstado) {
    counts.set(r.estado, {
      n: r._count._all,
      total: r._sum.valor ? Number(r._sum.valor) : 0,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/soporte/finanzas"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3 w-3" /> Finanzas
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Landmark className="h-6 w-6 text-brand-blue" />
            Movimientos Incapacidades
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Consignaciones bancarias de entidades SGSS importadas desde extractos.
          </p>
        </div>
        {/* Sprint Soporte reorg — Importar y Registro manual ahora viven
            como dos modales lado a lado, no como secciones separadas. */}
        <div className="flex items-center gap-2">
          <UploadExtractoButton />
          <RegistroManualButton
            entidades={entidades
              .filter((e) => e.tipo === 'EPS' || e.tipo === 'ARL')
              .map((e) => ({
                id: e.id,
                codigo: e.codigo,
                nombre: e.nombre,
                tipo: e.tipo as 'EPS' | 'ARL',
              }))}
            empresas={empresas}
          />
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(Object.keys(ESTADO_LABEL) as MovimientoIncEstado[]).map((e) => {
          const c = counts.get(e);
          return (
            <div
              key={e}
              className={cn(
                'rounded-xl border bg-white p-3 shadow-sm',
                e === 'PENDIENTE' && 'border-amber-200',
                e === 'CONCILIADO' && 'border-emerald-200',
                e === 'ANULADO' && 'border-slate-200',
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {ESTADO_LABEL[e]}
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
                {c?.n ?? 0}
              </p>
              {c && c.total > 0 && (
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">{formatCOP(c.total)}</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/finanzas/movimientos-incapacidades"
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Desde</span>
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Hasta</span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Banco</span>
              <select
                name="banco"
                defaultValue={banco}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {bancos
                  .map((b) => b.bancoOrigen)
                  .filter((b): b is string => !!b)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
              <select
                name="estado"
                defaultValue={estadoFilter ?? ''}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">Todos</option>
                {(Object.keys(ESTADO_LABEL) as MovimientoIncEstado[]).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Buscar</span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Consecutivo o concepto…"
                className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-xs"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Aplicar
            </button>
            <span className="ml-auto self-center text-xs text-slate-500">{movimientos.length}</span>
          </form>
        </div>

        {movimientos.length === 0 ? (
          <Alert variant="info" className="m-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Sin movimientos. Importa un extracto o registra uno manual.</span>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Consecutivo</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Banco</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Empresa planilla</th>
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Det.</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-semibold">
                      <Link
                        href={`/admin/soporte/finanzas/movimientos-incapacidades/${m.id}`}
                        className="text-brand-blue hover:underline"
                      >
                        {m.consecutivo}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {m.fechaIngreso.toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">{m.bancoOrigen ?? '—'}</td>
                    <td className="px-3 py-2 text-[11px]">
                      {m.entidadSgss ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
                          <span className="font-semibold text-slate-700">{m.entidadSgss.tipo}</span>
                          <span className="text-slate-600">{m.entidadSgss.nombre}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <AsignarEmpresaCell
                        movimientoId={m.id}
                        actual={
                          m.empresa
                            ? { id: m.empresa.id, nombre: m.empresa.nombre, nit: m.empresa.nit }
                            : null
                        }
                        empresas={empresas}
                      />
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      <p className="line-clamp-2">{m.concepto}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-semibold">
                      {formatCOP(Number(m.valor))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{m._count.detalles}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          ESTADO_TONE[m.estado],
                        )}
                      >
                        {ESTADO_LABEL[m.estado]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
