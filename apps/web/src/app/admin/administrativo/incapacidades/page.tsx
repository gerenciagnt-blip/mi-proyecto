import Link from 'next/link';
import {
  HeartPulse,
  FileText,
  Plus,
  Paperclip,
  AlertCircle,
} from 'lucide-react';
import type { IncapacidadEstado, Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getUserScope } from '@/lib/sucursal-scope';
import { TIPO_LABEL } from '@/lib/incapacidades/validations';
import { RadicarIncapacidadForm } from './radicar-form';
import { VerGestionesIncapButton } from './ver-gestiones-button';

export const metadata = { title: 'Incapacidades · Administrativo — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { tab?: string; estado?: string; q?: string };

const ESTADO_LABEL: Record<IncapacidadEstado, string> = {
  RADICADA: 'Radicada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
  RECHAZADA: 'Rechazada',
};
const ESTADO_TONE: Record<IncapacidadEstado, string> = {
  RADICADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_REVISION: 'bg-amber-50 text-amber-700 ring-amber-200',
  APROBADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PAGADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
};

export default async function IncapacidadesAdministrativoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tab: 'radicar' | 'historico' =
    sp.tab === 'historico' ? 'historico' : 'radicar';

  const estadoFilter: IncapacidadEstado | undefined =
    sp.estado === 'RADICADA' ||
    sp.estado === 'EN_REVISION' ||
    sp.estado === 'APROBADA' ||
    sp.estado === 'PAGADA' ||
    sp.estado === 'RECHAZADA'
      ? (sp.estado as IncapacidadEstado)
      : undefined;

  const q = sp.q?.trim() ?? '';

  const scope = await getUserScope();
  const scopeWhere: Prisma.IncapacidadWhereInput =
    scope?.tipo === 'SUCURSAL' ? { sucursalId: scope.sucursalId } : {};

  const where: Prisma.IncapacidadWhereInput = { ...scopeWhere };
  if (estadoFilter) where.estado = estadoFilter;
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      {
        cotizante: {
          OR: [
            { numeroDocumento: { contains: q, mode: 'insensitive' } },
            { primerNombre: { contains: q, mode: 'insensitive' } },
            { primerApellido: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  const [historico, statsByEstado] = await Promise.all([
    tab === 'historico'
      ? prisma.incapacidad.findMany({
          where,
          orderBy: { fechaRadicacion: 'desc' },
          take: 200,
          include: {
            cotizante: {
              select: {
                tipoDocumento: true,
                numeroDocumento: true,
                primerNombre: true,
                primerApellido: true,
                segundoApellido: true,
              },
            },
            _count: { select: { documentos: true, gestiones: true } },
          },
        })
      : Promise.resolve([]),
    prisma.incapacidad.groupBy({
      by: ['estado'],
      where: scopeWhere,
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<IncapacidadEstado, number>();
  for (const r of statsByEstado) counts.set(r.estado, r._count._all);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <HeartPulse className="h-6 w-6 text-brand-blue" />
          Incapacidades
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Radica una incapacidad y consulta el estado. Soporte verá tu
          radicación y actualizará el proceso.
        </p>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          <Link
            href="/admin/administrativo/incapacidades"
            className={cn(
              'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
              tab === 'radicar'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <Plus className="h-4 w-4" />
            Radicar
          </Link>
          <Link
            href="/admin/administrativo/incapacidades?tab=historico"
            className={cn(
              'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
              tab === 'historico'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <FileText className="h-4 w-4" />
            Consolidado
            <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
              {Array.from(counts.values()).reduce((s, n) => s + n, 0)}
            </span>
          </Link>
        </nav>
      </div>

      {tab === 'radicar' && <RadicarIncapacidadForm />}

      {tab === 'historico' && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(ESTADO_LABEL) as IncapacidadEstado[]).map((e) => (
              <div
                key={e}
                className={cn(
                  'rounded-xl border bg-white p-3 shadow-sm',
                  e === 'RADICADA' && 'border-sky-200',
                  e === 'EN_REVISION' && 'border-amber-200',
                  e === 'APROBADA' && 'border-violet-200',
                  e === 'PAGADA' && 'border-emerald-200',
                  e === 'RECHAZADA' && 'border-red-200',
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {ESTADO_LABEL[e]}
                </p>
                <p className="mt-1 font-mono text-xl font-bold tracking-tight text-slate-900">
                  {counts.get(e) ?? 0}
                </p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <form
                method="GET"
                action="/admin/administrativo/incapacidades"
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="tab" value="historico" />
                <select
                  name="estado"
                  defaultValue={estadoFilter ?? ''}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">Todos los estados</option>
                  {(Object.keys(ESTADO_LABEL) as IncapacidadEstado[]).map(
                    (e) => (
                      <option key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </option>
                    ),
                  )}
                </select>
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Consecutivo, documento o nombre…"
                  className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
                >
                  Buscar
                </button>
                {(estadoFilter || q) && (
                  <Link
                    href="/admin/administrativo/incapacidades?tab=historico"
                    className="h-9 leading-9 text-xs text-slate-500"
                  >
                    Limpiar
                  </Link>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {historico.length}{' '}
                  {historico.length === 1 ? 'radicación' : 'radicaciones'}
                </span>
              </form>
            </div>

            {historico.length === 0 ? (
              <Alert variant="info" className="m-5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Aún no hay radicaciones. Usa la pestaña{' '}
                  <strong>Radicar</strong> para crear la primera.
                </span>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Consecutivo</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Cotizante</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2">Período</th>
                      <th className="px-4 py-2 text-right">Días</th>
                      <th className="px-4 py-2">Docs</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historico.map((i) => {
                      const nombre = [
                        i.cotizante.primerNombre,
                        i.cotizante.primerApellido,
                        i.cotizante.segundoApellido,
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <tr key={i.id}>
                          <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-blue">
                            {i.consecutivo}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-slate-500">
                            {i.fechaRadicacion.toLocaleDateString('es-CO')}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <p className="font-medium">{nombre}</p>
                            <p className="font-mono text-[10px] text-slate-500">
                              {i.cotizante.tipoDocumento}{' '}
                              {i.cotizante.numeroDocumento}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-[11px]">
                            {TIPO_LABEL[i.tipo]}
                          </td>
                          <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                            {i.fechaInicio.toISOString().slice(0, 10)} →{' '}
                            {i.fechaFin.toISOString().slice(0, 10)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs">
                            {i.diasIncapacidad}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-slate-500">
                            <Paperclip className="mr-0.5 inline h-3 w-3" />
                            {i._count.documentos}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                                ESTADO_TONE[i.estado],
                              )}
                            >
                              {ESTADO_LABEL[i.estado]}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <VerGestionesIncapButton
                              incapacidadId={i.id}
                              consecutivo={i.consecutivo}
                              gestionesCount={i._count.gestiones}
                              cotizanteNombre={nombre}
                              aliado
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
