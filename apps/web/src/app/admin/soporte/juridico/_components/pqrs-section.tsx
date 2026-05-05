/**
 * Sección "PQRS" del módulo Soporte/Jurídico — listado de PQRS
 * recibidas desde la landing pública. Server Component.
 */

import Link from 'next/link';
import { MessageSquare, FileText, Mail, Phone, AlertCircle, Clock } from 'lucide-react';
import type { Prisma, PqrsTipo, PqrsEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { cn } from '@/lib/utils';
import { PQRS_TIPO_LABEL, diasHabilesRestantes } from '@/lib/pqrs/plazos';

type PqrsSP = {
  q?: string;
  estado?: string;
  tipo?: string;
};

const ESTADO_LABEL: Record<PqrsEstado, string> = {
  RECIBIDA: 'Recibida',
  EN_TRAMITE: 'En trámite',
  RESPONDIDA: 'Respondida',
  CERRADA: 'Cerrada',
  RECHAZADA: 'Rechazada',
};

const ESTADO_TONE: Record<PqrsEstado, string> = {
  RECIBIDA: 'bg-sky-50 text-sky-700 ring-sky-200',
  EN_TRAMITE: 'bg-amber-50 text-amber-700 ring-amber-200',
  RESPONDIDA: 'bg-violet-50 text-violet-700 ring-violet-200',
  CERRADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const TIPO_TONE: Record<PqrsTipo, string> = {
  PETICION: 'bg-slate-100 text-slate-700',
  QUEJA: 'bg-amber-100 text-amber-800',
  RECLAMO: 'bg-rose-100 text-rose-800',
  SUGERENCIA: 'bg-sky-100 text-sky-800',
  FELICITACION: 'bg-emerald-100 text-emerald-800',
};

const ESTADOS: PqrsEstado[] = ['RECIBIDA', 'EN_TRAMITE', 'RESPONDIDA', 'CERRADA', 'RECHAZADA'];
const TIPOS: PqrsTipo[] = ['PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'FELICITACION'];

export async function PqrsSection({ sp }: { sp: PqrsSP }) {
  const q = sp.q?.trim() ?? '';
  const estadoFilter =
    sp.estado && (ESTADOS as string[]).includes(sp.estado) ? (sp.estado as PqrsEstado) : undefined;
  const tipoFilter =
    sp.tipo && (TIPOS as string[]).includes(sp.tipo) ? (sp.tipo as PqrsTipo) : undefined;

  const where: Prisma.PqrsWhereInput = {
    ...(estadoFilter ? { estado: estadoFilter } : {}),
    ...(tipoFilter ? { tipo: tipoFilter } : {}),
  };
  if (q) {
    where.OR = [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { numeroDocumento: { contains: q, mode: 'insensitive' } },
      { nombres: { contains: q, mode: 'insensitive' } },
      { apellidos: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { asunto: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [pqrsList, statsByEstado, urgentes] = await Promise.all([
    prisma.pqrs.findMany({
      where,
      orderBy: [{ recibidaEn: 'desc' }],
      take: 200,
      select: {
        id: true,
        consecutivo: true,
        tipo: true,
        estado: true,
        nombres: true,
        apellidos: true,
        numeroDocumento: true,
        email: true,
        telefono: true,
        empresaNombre: true,
        asunto: true,
        recibidaEn: true,
        fechaLimite: true,
        respondidaEn: true,
        notificadoEmailEn: true,
        notificadoWhatsappEn: true,
        _count: { select: { documentos: true, gestiones: true } },
      },
    }),
    prisma.pqrs.groupBy({ by: ['estado'], _count: { _all: true } }),
    prisma.pqrs.count({
      where: {
        estado: { in: ['RECIBIDA', 'EN_TRAMITE'] },
        fechaLimite: { lte: addDaysHabiles(new Date(), 2) },
      },
    }),
  ]);

  const countByEstado = new Map<PqrsEstado, number>();
  for (const r of statsByEstado) {
    countByEstado.set(r.estado, r._count._all);
  }

  const totalActivas =
    (countByEstado.get('RECIBIDA') ?? 0) + (countByEstado.get('EN_TRAMITE') ?? 0);

  const ahora = new Date();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Activas" value={totalActivas} tone="amber" />
        <StatCard label="Recibidas" value={countByEstado.get('RECIBIDA') ?? 0} tone="sky" />
        <StatCard label="Respondidas" value={countByEstado.get('RESPONDIDA') ?? 0} tone="violet" />
        <StatCard label="Por vencer" value={urgentes} tone="rose" sub="≤ 2 días háb." />
      </div>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/soporte/juridico"
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="seccion" value="pqrs" />
            <select
              name="estado"
              defaultValue={estadoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
            <select
              name="tipo"
              defaultValue={tipoFilter ?? ''}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {PQRS_TIPO_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Consecutivo, cédula, nombre, asunto…"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-xs font-medium text-white hover:bg-brand-blue-dark"
            >
              Filtrar
            </button>
            {(q || estadoFilter || tipoFilter) && (
              <Link href="/admin/soporte/juridico?seccion=pqrs" className="text-xs text-slate-500">
                Limpiar
              </Link>
            )}
            <span className="ml-auto text-[10px] text-slate-400">
              {pqrsList.length} resultado{pqrsList.length !== 1 ? 's' : ''}
            </span>
          </form>
        </div>

        {pqrsList.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              {q || estadoFilter || tipoFilter
                ? 'Sin resultados con los filtros actuales.'
                : 'Aún no hay PQRS radicadas. Cuando entren desde la landing aparecerán aquí.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Consec.</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Solicitante</th>
                  <th className="px-3 py-2 text-left font-medium">Asunto</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2 text-center font-medium">Plazo</th>
                  <th className="px-3 py-2 text-center font-medium">Recibida</th>
                  <th className="px-3 py-2 text-center font-medium">Notif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pqrsList.map((p) => {
                  const dias = diasHabilesRestantes(p.fechaLimite, ahora);
                  const vencida =
                    dias < 0 && !['RESPONDIDA', 'CERRADA', 'RECHAZADA'].includes(p.estado);
                  const urgente =
                    dias >= 0 && dias <= 2 && p.estado !== 'RESPONDIDA' && p.estado !== 'CERRADA';
                  const nombreCompleto = [p.nombres, p.apellidos].filter(Boolean).join(' ');
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                        <Link
                          href={`/admin/soporte/juridico/pqrs/${p.id}`}
                          className="font-semibold text-brand-blue hover:underline"
                        >
                          {p.consecutivo}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            TIPO_TONE[p.tipo],
                          )}
                        >
                          {PQRS_TIPO_LABEL[p.tipo]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium text-slate-900">{nombreCompleto}</p>
                        <p className="font-mono text-[10px] text-slate-500">{p.numeroDocumento}</p>
                        {p.empresaNombre && (
                          <p
                            className="truncate text-[10px] text-slate-500"
                            title={p.empresaNombre}
                          >
                            {p.empresaNombre}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <p className="truncate text-xs text-slate-700" title={p.asunto}>
                          {p.asunto}
                        </p>
                        {p._count.documentos > 0 && (
                          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                            <FileText className="h-3 w-3" />
                            {p._count.documentos} adjunto{p._count.documentos !== 1 ? 's' : ''}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            ESTADO_TONE[p.estado],
                          )}
                        >
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        {vencida ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            <AlertCircle className="h-3 w-3" />
                            Vencida {Math.abs(dias)}d
                          </span>
                        ) : urgente ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Clock className="h-3 w-3" />
                            {dias}d
                          </span>
                        ) : p.estado === 'RESPONDIDA' || p.estado === 'CERRADA' ? (
                          <span className="text-[10px] text-emerald-600">✓</span>
                        ) : (
                          <span className="text-[10px] text-slate-500">{dias}d</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center text-[10px] text-slate-500">
                        {p.recibidaEn.toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            title={
                              p.notificadoEmailEn
                                ? `Email enviado: ${p.notificadoEmailEn.toLocaleString('es-CO')}`
                                : 'Email pendiente'
                            }
                          >
                            <Mail
                              className={cn(
                                'h-3 w-3',
                                p.notificadoEmailEn ? 'text-emerald-500' : 'text-slate-300',
                              )}
                            />
                          </span>
                          <span
                            title={
                              p.notificadoWhatsappEn
                                ? `WhatsApp enviado: ${p.notificadoWhatsappEn.toLocaleString('es-CO')}`
                                : 'WhatsApp pendiente'
                            }
                          >
                            <Phone
                              className={cn(
                                'h-3 w-3',
                                p.notificadoWhatsappEn ? 'text-emerald-500' : 'text-slate-300',
                              )}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-500">
        Las PQRS llegan desde la landing pública (formulario en el footer). El equipo legal las
        gestiona desde aquí: cambia el estado, responde, sube documentos y la bitácora queda
        registrada.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'sky' | 'violet' | 'rose';
  sub?: string;
}) {
  const colorMap = {
    amber: 'border-amber-200 text-amber-700',
    sky: 'border-sky-200 text-sky-700',
    violet: 'border-violet-200 text-violet-700',
    rose: 'border-rose-200 text-rose-700',
  }[tone];
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-sm', colorMap)}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

/** Helper local — agrega N días hábiles a una fecha (mismo patrón que plazos.ts). */
function addDaysHabiles(desde: Date, n: number): Date {
  const fecha = new Date(desde);
  let agregados = 0;
  while (agregados < n) {
    fecha.setDate(fecha.getDate() + 1);
    const dow = fecha.getDay();
    if (dow !== 0 && dow !== 6) agregados++;
  }
  return fecha;
}
