import Link from 'next/link';
import { Scale, FileText, Lock } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { TIPO_LABEL, ESTADO_LABEL, ESTADO_TONE } from '@/lib/incapacidades/validations';
import { requireStaff } from '@/lib/auth-helpers';
import { DiasIncapacidadChip } from '@/components/admin/dias-incapacidad-chip';

export const metadata = { title: 'Jurídico · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

type SP = { q?: string };

/**
 * Bandeja Soporte / Jurídico — lista las incapacidades que están en
 * flujo legal (TRASLADO_A_JURIDICO o EN_PROCESO_JURIDICO).
 *
 * Visible a TODO STAFF (ADMIN/SOPORTE). Los documentos confidenciales
 * del caso se ven listados pero solo se descargan si el user tiene el
 * permiso `soporte.juridico_confidencial` (validado en el endpoint).
 */
export default async function JuridicoBandejaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';

  const where: Prisma.IncapacidadWhereInput = {
    estado: { in: ['TRASLADO_A_JURIDICO', 'EN_PROCESO_JURIDICO'] },
  };
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

  const [casos, statsByEstado] = await Promise.all([
    prisma.incapacidad.findMany({
      where,
      // Más reciente al traslado primero — para que casos nuevos en
      // jurídico se vean arriba sin que el operador filtre.
      orderBy: { updatedAt: 'desc' },
      take: 300,
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
        sucursal: { select: { codigo: true, nombre: true } },
        _count: {
          select: {
            documentos: true,
            gestiones: { where: { accionadaPor: 'JURIDICO' } },
          },
        },
        // Cuenta de documentos confidenciales — se muestra como ícono 🔒
        // en la fila para que el aliado/soporte sepa que hay material
        // privado del proceso.
        documentos: {
          where: { confidencial: true, eliminado: false },
          select: { id: true },
        },
      },
    }),
    prisma.incapacidad.groupBy({
      by: ['estado'],
      where: { estado: { in: ['TRASLADO_A_JURIDICO', 'EN_PROCESO_JURIDICO'] } },
      _count: { _all: true },
    }),
  ]);

  const countByEstado = new Map<string, number>();
  for (const s of statsByEstado) {
    countByEstado.set(s.estado, s._count._all);
  }
  const totalCasos = casos.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Soporte · Jurídico
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Casos de incapacidad derivados al área legal. Los documentos confidenciales del proceso
            solo son descargables por usuarios con permiso jurídico.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Total en flujo
          </p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
            {totalCasos}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Trasladados</p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-indigo-700">
            {countByEstado.get('TRASLADO_A_JURIDICO') ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">En proceso</p>
          <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-indigo-800">
            {countByEstado.get('EN_PROCESO_JURIDICO') ?? 0}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form method="GET" action="/admin/soporte/juridico" className="flex items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por consecutivo, cédula o nombre..."
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15 sm:max-w-md"
            />
            {q && (
              <Link
                href="/admin/soporte/juridico"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Link>
            )}
          </form>
        </div>

        {casos.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Scale className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              {q
                ? 'Sin resultados con la búsqueda actual.'
                : 'No hay casos en flujo jurídico actualmente.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Consecutivo</th>
                  <th className="px-4 py-2 text-left font-medium">Cotizante</th>
                  <th className="px-4 py-2 text-left font-medium">Sucursal</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium">Días</th>
                  <th className="px-4 py-2 text-left font-medium">Estado</th>
                  <th className="px-4 py-2 text-center font-medium">Docs</th>
                  <th className="px-4 py-2 text-center font-medium">Gestiones</th>
                  <th className="px-4 py-2 text-right font-medium">Última actualización</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {casos.map((c) => {
                  const docsConfidenciales = c.documentos.length;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        <Link
                          href={`/admin/soporte/juridico/${c.id}`}
                          className="text-brand-blue hover:underline"
                        >
                          {c.consecutivo}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">
                          {c.cotizante.primerNombre} {c.cotizante.primerApellido}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.cotizante.tipoDocumento} {c.cotizante.numeroDocumento}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-700">
                        <span className="font-mono">{c.sucursal.codigo}</span> · {c.sucursal.nombre}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                        {TIPO_LABEL[c.tipo]}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* El chip muestra "días en proceso" desde la
                            radicación. En jurídico nunca hay fechaCierre
                            mientras el caso esté activo en este flujo. */}
                        <DiasIncapacidadChip
                          fechaRadicacion={c.fechaRadicacion}
                          estado={c.estado}
                          fechaCierre={null}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[c.estado],
                          )}
                        >
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <FileText className="h-3.5 w-3.5" />
                          {c._count.documentos}
                        </span>
                        {docsConfidenciales > 0 && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-0.5 text-indigo-700"
                            title={`${docsConfidenciales} confidencial(es)`}
                          >
                            <Lock className="h-3 w-3" />
                            {docsConfidenciales}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-slate-600">
                        {c._count.gestiones}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-500">
                        {c.updatedAt.toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
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
  );
}
