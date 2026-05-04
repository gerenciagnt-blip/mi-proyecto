import Link from 'next/link';
import { KeyRound, CheckCircle2, AlertCircle, Clock, Building2, ChevronRight } from 'lucide-react';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { DispararLoginButton, DispararLogoutButton } from './disparar-button';

export const metadata = { title: 'Sesiones Colpatria — Sistema PILA' };
export const dynamic = 'force-dynamic';

type EstadoSesion = 'ACTIVA' | 'EXPIRADA' | 'SIN_SESION' | 'INCOMPLETA';

const ESTADO_TONE: Record<
  EstadoSesion,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  ACTIVA: {
    label: 'Activa',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Icon: CheckCircle2,
  },
  EXPIRADA: {
    label: 'Expirada',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    Icon: Clock,
  },
  SIN_SESION: {
    label: 'Sin sesión',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
    Icon: AlertCircle,
  },
  INCOMPLETA: {
    label: 'Config incompleta',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    Icon: AlertCircle,
  },
};

function fmtFecha(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelativo(d: Date | null, ahora: Date): string {
  if (!d) return '—';
  const diffMs = d.getTime() - ahora.getTime();
  const absMs = Math.abs(diffMs);
  const futuro = diffMs > 0;
  if (absMs < 60_000) return futuro ? 'en <1 min' : 'hace <1 min';
  if (absMs < 3_600_000) {
    const m = Math.floor(absMs / 60_000);
    return futuro ? `en ${m} min` : `hace ${m} min`;
  }
  if (absMs < 86_400_000) {
    const h = Math.floor(absMs / 3_600_000);
    return futuro ? `en ${h}h` : `hace ${h}h`;
  }
  const dias = Math.floor(absMs / 86_400_000);
  return futuro ? `en ${dias}d` : `hace ${dias}d`;
}

export default async function ColpatriaSesionesPage() {
  await requireRole('ADMIN', 'SOPORTE');

  // Trae todas las empresas con Colpatria activo + su sesión cacheada.
  // Empresas sin sesión salen igual (no tienen FK rota — la relación es 1:1
  // opcional desde el lado de Empresa).
  const empresas = await prisma.empresa.findMany({
    where: { active: true, colpatriaActivo: true },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      nit: true,
      colpatriaUsuario: true,
      colpatriaPasswordEnc: true,
      colpatriaAplicacion: true,
      colpatriaPerfil: true,
      colpatriaEmpresaIdInterno: true,
      colpatriaAfiliacionId: true,
      colpatriaSesion: {
        select: {
          createdAt: true,
          updatedAt: true,
          expiraEn: true,
        },
      },
    },
  });

  const ahora = new Date();

  type Fila = {
    empresaId: string;
    nombre: string;
    nit: string;
    estado: EstadoSesion;
    creada: Date | null;
    actualizada: Date | null;
    expiraEn: Date | null;
    configIncompleta: boolean;
  };

  const filas: Fila[] = empresas.map((e) => {
    const incompleta =
      !e.colpatriaUsuario ||
      !e.colpatriaPasswordEnc ||
      !e.colpatriaAplicacion ||
      !e.colpatriaPerfil ||
      !e.colpatriaEmpresaIdInterno ||
      !e.colpatriaAfiliacionId;

    let estado: EstadoSesion;
    if (incompleta) estado = 'INCOMPLETA';
    else if (!e.colpatriaSesion) estado = 'SIN_SESION';
    else if (e.colpatriaSesion.expiraEn && e.colpatriaSesion.expiraEn < ahora) estado = 'EXPIRADA';
    else estado = 'ACTIVA';

    return {
      empresaId: e.id,
      nombre: e.nombre,
      nit: e.nit ?? '—',
      estado,
      creada: e.colpatriaSesion?.createdAt ?? null,
      actualizada: e.colpatriaSesion?.updatedAt ?? null,
      expiraEn: e.colpatriaSesion?.expiraEn ?? null,
      configIncompleta: incompleta,
    };
  });

  const conteos = {
    activas: filas.filter((f) => f.estado === 'ACTIVA').length,
    expiradas: filas.filter((f) => f.estado === 'EXPIRADA').length,
    sinSesion: filas.filter((f) => f.estado === 'SIN_SESION').length,
    incompletas: filas.filter((f) => f.estado === 'INCOMPLETA').length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <KeyRound className="h-6 w-6 text-brand-blue" />
            Sesiones Colpatria
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Estado de inicio/cierre de sesión por empresa. El cron levanta sesión Lun–Sáb 7 AM y la
            cierra 9 PM. Si una empresa quedó inactiva fuera de horario, podés disparar el login
            manualmente.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <DispararLogoutButton />
          <DispararLoginButton />
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Activas" value={conteos.activas} tone="emerald" />
        <StatCard label="Expiradas" value={conteos.expiradas} tone="amber" />
        <StatCard label="Sin sesión" value={conteos.sinSesion} tone="slate" />
        <StatCard label="Config incompleta" value={conteos.incompletas} tone="rose" />
      </div>

      {filas.length === 0 ? (
        <Alert variant="info">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No hay empresas con Colpatria activo. Activalo en{' '}
            <Link href="/admin/empresas" className="underline">
              Empresas
            </Link>{' '}
            → ficha de empresa → tab Colpatria.
          </span>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Sesión iniciada</th>
                  <th className="px-4 py-2">Última actualización</th>
                  <th className="px-4 py-2">Expira</th>
                  <th className="px-4 py-2 text-right">Configuración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => {
                  const tone = ESTADO_TONE[f.estado];
                  const Icon = tone.Icon;
                  return (
                    <tr key={f.empresaId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="flex items-center gap-2 font-medium text-slate-900">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {f.nombre}
                        </p>
                        <p className="font-mono text-[10px] text-slate-500">NIT {f.nit}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                            tone.className,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{fmtFecha(f.creada)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {fmtFecha(f.actualizada)}
                        {f.actualizada && (
                          <span className="ml-1 text-[10px] text-slate-400">
                            ({fmtRelativo(f.actualizada, ahora)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {f.expiraEn ? (
                          <>
                            <span
                              className={
                                f.estado === 'EXPIRADA' ? 'text-amber-700' : 'text-slate-600'
                              }
                            >
                              {fmtFecha(f.expiraEn)}
                            </span>
                            <span className="ml-1 text-[10px] text-slate-400">
                              ({fmtRelativo(f.expiraEn, ahora)})
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/admin/empresas/${f.empresaId}/colpatria`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                          title="Editar configuración Colpatria de esta empresa"
                        >
                          {f.configIncompleta ? 'Completar' : 'Editar'}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium">¿Cómo funciona?</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
          <li>
            <strong>Activa</strong>: la sesión existe y aún no expira. El bot la reusa al procesar
            jobs sin pagar el costo de re-loguearse.
          </li>
          <li>
            <strong>Expirada</strong>: la sesión existe pero su TTL pasó. El próximo job hará login
            fresco automáticamente.
          </li>
          <li>
            <strong>Sin sesión</strong>: nunca se cacheó (o el logout-auto la borró). El próximo job
            hará login.
          </li>
          <li>
            <strong>Config incompleta</strong>: faltan credenciales o selectores AXA. El bot ignora
            esta empresa hasta que se completen.
          </li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'slate' | 'rose';
}) {
  const colorMap = {
    emerald: 'border-emerald-200 text-emerald-700',
    amber: 'border-amber-200 text-amber-700',
    slate: 'border-slate-200 text-slate-700',
    rose: 'border-rose-200 text-rose-700',
  };
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-sm', colorMap[tone])}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}
