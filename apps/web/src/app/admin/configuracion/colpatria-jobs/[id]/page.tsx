import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Image as ImageIcon } from 'lucide-react';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { ReintentarButton } from '../reintentar-button';

export const metadata = { title: 'Job Colpatria — Sistema PILA' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700 ring-slate-200',
  RUNNING: 'bg-blue-50 text-blue-700 ring-blue-200',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
  RETRYABLE: 'bg-amber-50 text-amber-800 ring-amber-200',
};

export default async function JobDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN', 'SOPORTE');
  const { id } = await params;

  const job = await prisma.colpatriaAfiliacionJob.findUnique({
    where: { id },
    include: {
      afiliacion: {
        include: {
          cotizante: true,
        },
      },
      empresa: { select: { id: true, nit: true, nombre: true } },
    },
  });
  if (!job) notFound();

  const cotizante = job.afiliacion.cotizante;
  const reintentable = job.status === 'FAILED' || job.status === 'RETRYABLE';
  const screenshots = Array.isArray(job.screenshotsPaths) ? (job.screenshotsPaths as string[]) : [];

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <Link
          href="/admin/configuracion/colpatria-jobs"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la lista
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Colpatria</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">{job.id}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[job.status] ?? STATUS_TONE.PENDING}`}
          >
            {job.status}
            {job.intento > 1 && <span className="ml-1 opacity-70">· intento {job.intento}</span>}
          </span>
        </div>
      </header>

      {/* Datos del cotizante y empresa */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Cotizante</h2>
          <p className="text-sm font-medium text-slate-900">
            {cotizante.primerNombre} {cotizante.segundoNombre} {cotizante.primerApellido}{' '}
            {cotizante.segundoApellido}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {cotizante.tipoDocumento} {cotizante.numeroDocumento}
          </p>
          {cotizante.email && <p className="mt-1 text-xs text-slate-600">{cotizante.email}</p>}
          {cotizante.celular && <p className="text-xs text-slate-600">📞 {cotizante.celular}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Empresa</h2>
          <p className="text-sm font-medium text-slate-900">{job.empresa.nombre}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">NIT {job.empresa.nit}</p>
        </div>
      </section>

      {/* Tiempos */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-[10px] uppercase tracking-wider text-slate-500">Cronología</h2>
        <dl className="grid gap-3 text-xs lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Creado</dt>
            <dd className="mt-0.5 font-medium text-slate-900">
              {job.createdAt.toLocaleString('es-CO')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Iniciado</dt>
            <dd className="mt-0.5 font-medium text-slate-900">
              {job.startedAt?.toLocaleString('es-CO') ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Finalizado</dt>
            <dd className="mt-0.5 font-medium text-slate-900">
              {job.finishedAt?.toLocaleString('es-CO') ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Duración</dt>
            <dd className="mt-0.5 font-medium text-slate-900">
              {job.durationMs != null
                ? job.durationMs < 1000
                  ? `${job.durationMs}ms`
                  : `${(job.durationMs / 1000).toFixed(1)}s`
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Resultado */}
      {job.status === 'SUCCESS' && job.pdfPath && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <FileText className="h-4 w-4" />
            Soporte de afiliación descargado
          </h2>
          <Link
            href={`/api/colpatria/jobs/${job.id}/pdf`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Descargar PDF
          </Link>
        </section>
      )}

      {job.error && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-rose-900">Error</h2>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-white p-3 text-[10px] text-rose-800 ring-1 ring-rose-200">
            {job.error}
          </pre>
          {reintentable && (
            <div className="mt-3">
              <ReintentarButton jobId={job.id} />
            </div>
          )}
        </section>
      )}

      {/* Screenshots si los hay */}
      {screenshots.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ImageIcon className="h-4 w-4" />
            Capturas del proceso ({screenshots.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {screenshots.map((path, i) => (
              <Link
                key={i}
                href={`/api/colpatria/jobs/${job.id}/screenshot/${i}`}
                className="block rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600 hover:bg-slate-100"
              >
                <p className="font-mono">paso {i + 1}</p>
                <p className="mt-0.5 truncate text-slate-500">{path}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Payload (debug) */}
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Payload del job (debug)
        </summary>
        <div className="border-t border-slate-200 p-4">
          <pre className="max-h-96 overflow-auto rounded-md bg-slate-50 p-3 text-[10px] leading-relaxed text-slate-700">
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
