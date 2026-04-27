import Link from 'next/link';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  FileText,
  Eye,
} from 'lucide-react';
import { prisma } from '@pila/db';
import type { ColpatriaJobStatus } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { ReintentarButton } from './reintentar-button';
import { EmpresaFilter } from './empresa-filter';

export const metadata = { title: 'Jobs Colpatria — Sistema PILA' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SP = {
  status?: string;
  empresaId?: string;
  page?: string;
};

const STATUS_TONE: Record<
  ColpatriaJobStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
    Icon: Clock,
  },
  RUNNING: {
    label: 'Running',
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    Icon: Loader2,
  },
  SUCCESS: {
    label: 'Success',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    Icon: XCircle,
  },
  RETRYABLE: {
    label: 'Retry',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    Icon: AlertTriangle,
  },
};

const STATUS_VALUES: ColpatriaJobStatus[] = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'RETRYABLE',
  'FAILED',
];

function fmtDuracion(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

export default async function ColpatriaJobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  // STAFF + ADMIN — el aliado_owner no necesita ver jobs cross-empresa.
  await requireRole('ADMIN', 'SOPORTE');

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const statusFiltro =
    sp.status && (STATUS_VALUES as string[]).includes(sp.status)
      ? (sp.status as ColpatriaJobStatus)
      : undefined;
  const empresaFiltro = sp.empresaId?.trim() ?? undefined;

  const where = {
    ...(statusFiltro ? { status: statusFiltro } : {}),
    ...(empresaFiltro ? { empresaId: empresaFiltro } : {}),
  };

  const [jobs, total, empresas] = await Promise.all([
    prisma.colpatriaAfiliacionJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip,
      select: {
        id: true,
        status: true,
        intento: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        error: true,
        pdfPath: true,
        createdAt: true,
        afiliacion: {
          select: {
            id: true,
            cotizante: {
              select: {
                primerNombre: true,
                primerApellido: true,
                numeroDocumento: true,
              },
            },
          },
        },
        empresa: { select: { id: true, nit: true, nombre: true } },
      },
    }),
    prisma.colpatriaAfiliacionJob.count({ where }),
    prisma.empresa.findMany({
      where: { colpatriaActivo: true, active: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function urlCon(patch: Partial<SP>): string {
    const qs = new URLSearchParams();
    const final = {
      status: sp.status ?? '',
      empresaId: sp.empresaId ?? '',
      page: '',
      ...patch,
    };
    if (final.status) qs.set('status', final.status);
    if (final.empresaId) qs.set('empresaId', final.empresaId);
    if (final.page) qs.set('page', final.page);
    return `?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Bot className="h-6 w-6 text-brand-blue" />
          Jobs Bot Colpatria ARL
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Histórico de afiliaciones procesadas (o por procesar) en el portal Colpatria. Solo STAFF.
        </p>
      </header>

      {/* Filtros */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Estado</span>
          <div className="flex gap-1">
            <Link
              href={urlCon({ status: '' })}
              className={`rounded-md border px-2 py-1 ${!statusFiltro ? 'border-brand-blue bg-brand-blue/5 text-brand-blue-dark' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              Todos
            </Link>
            {STATUS_VALUES.map((s) => {
              const t = STATUS_TONE[s];
              const active = statusFiltro === s;
              return (
                <Link
                  key={s}
                  href={urlCon({ status: s })}
                  className={`rounded-md border px-2 py-1 ${active ? `${t.className} ring-1 ring-inset` : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Empresa</span>
          <EmpresaFilter
            empresas={empresas}
            defaultEmpresaId={empresaFiltro ?? ''}
            statusActual={sp.status ?? ''}
          />
        </label>

        <span className="ml-auto text-[10px] text-slate-400">
          {total} job{total !== 1 ? 's' : ''}
        </span>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {jobs.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            Sin jobs para los filtros aplicados.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Creado</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-left font-medium">Cotizante</th>
                <th className="px-3 py-2 text-left font-medium">Empresa</th>
                <th className="px-3 py-2 text-left font-medium">Duración</th>
                <th className="px-3 py-2 text-left font-medium">Resultado</th>
                <th className="w-24 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => {
                const tone = STATUS_TONE[j.status];
                const Icon = tone.Icon;
                const cotizante = j.afiliacion.cotizante;
                const nombreCot = `${cotizante.primerNombre} ${cotizante.primerApellido}`.trim();
                const reintentable = j.status === 'FAILED' || j.status === 'RETRYABLE';
                return (
                  <tr key={j.id} className="text-slate-700 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                      {j.createdAt.toLocaleString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {j.intento > 1 && (
                        <span className="ml-1 rounded bg-amber-50 px-1 text-[9px] text-amber-700">
                          intento {j.intento}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone.className}`}
                      >
                        <Icon
                          className={`h-3 w-3 ${j.status === 'RUNNING' ? 'animate-spin' : ''}`}
                        />
                        {tone.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/base-datos?cotizante=${cotizante.numeroDocumento}`}
                        className="text-slate-900 hover:underline"
                      >
                        <p className="font-medium">{nombreCot}</p>
                        <p className="text-[10px] text-slate-500">{cotizante.numeroDocumento}</p>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      <p className="font-medium text-slate-900">{j.empresa.nombre}</p>
                      <p className="font-mono text-[10px] text-slate-500">NIT {j.empresa.nit}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                      {fmtDuracion(j.durationMs)}
                    </td>
                    <td className="max-w-[240px] px-3 py-2">
                      {j.error ? (
                        <p className="line-clamp-2 text-[10px] text-rose-700" title={j.error}>
                          {j.error}
                        </p>
                      ) : j.pdfPath ? (
                        <Link
                          href={`/api/colpatria/jobs/${j.id}/pdf`}
                          className="inline-flex items-center gap-1 text-[10px] text-brand-blue hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          Soporte PDF
                        </Link>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/configuracion/colpatria-jobs/${j.id}`}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Ver detalle"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        {reintentable && <ReintentarButton jobId={j.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Paginación */}
      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between text-xs text-slate-500">
          <p>
            Mostrando <strong>{skip + 1}</strong>–
            <strong>{Math.min(skip + PAGE_SIZE, total)}</strong> de <strong>{total}</strong>
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={urlCon({ page: String(page - 1) })}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              >
                <ChevronLeft className="h-3 w-3" />
                Anterior
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-slate-300">
                <ChevronLeft className="h-3 w-3" />
                Anterior
              </span>
            )}
            <span className="px-2">
              <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            {page < totalPages ? (
              <Link
                href={urlCon({ page: String(page + 1) })}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              >
                Siguiente
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-slate-300">
                Siguiente
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
