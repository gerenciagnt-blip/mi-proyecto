import Link from 'next/link';
import {
  Activity,
  Database,
  Clock,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Bot,
  ArrowRight,
} from 'lucide-react';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  chequearBD,
  chequearColpatria,
  chequearCrons,
  chequearUploads,
  type ResultadoCron,
} from '@/lib/sistema/status';

export const metadata = { title: 'Sistema — PILA' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtHoras(h: number): string {
  if (h === Infinity) return 'nunca';
  if (h < 1) return `${(h * 60).toFixed(0)} min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function chipEstado(c: ResultadoCron): { label: string; clase: string; Icon: typeof CheckCircle2 } {
  if (!c.ultimo) {
    return {
      label: 'Nunca corrió',
      clase: 'bg-slate-100 text-slate-600 ring-slate-200',
      Icon: AlertTriangle,
    };
  }
  if (c.ultimo.status === 'RUNNING') {
    return {
      label: 'En curso',
      clase: 'bg-blue-50 text-blue-700 ring-blue-200',
      Icon: Loader2,
    };
  }
  if (c.ultimo.status === 'ERROR') {
    return {
      label: 'Falló',
      clase: 'bg-rose-50 text-rose-700 ring-rose-200',
      Icon: XCircle,
    };
  }
  if (c.enAlerta) {
    return {
      label: 'Atrasado',
      clase: 'bg-amber-50 text-amber-800 ring-amber-200',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'OK',
    clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Icon: CheckCircle2,
  };
}

export default async function SistemaPage() {
  await requireAdmin();

  // Las consultas son independientes — paralelo.
  const [bd, crons, colpatria, uploads] = await Promise.all([
    chequearBD(),
    chequearCrons(),
    chequearColpatria(),
    Promise.resolve(chequearUploads()),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Activity className="h-6 w-6 text-brand-blue" />
          Estado del sistema
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Salud de la base de datos, jobs programados y uploads. Solo visible para ADMIN.
        </p>
      </header>

      {/* ====== BASE DE DATOS ====== */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-semibold text-slate-900">Base de datos</h2>
          {bd.ok ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Conectada
            </span>
          ) : (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
              Caída
            </span>
          )}
        </header>

        {!bd.ok ? (
          <p className="text-xs text-rose-700">{bd.errorMsg ?? 'Error desconocido'}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Latencia ping</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">
                {bd.pingMs}
                <span className="ml-1 text-xs font-normal text-slate-500">ms</span>
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">
                Tamaño total
              </p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">{bd.totalSize}</p>
            </div>

            {bd.tablas.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                  Top 10 tablas por tamaño
                </p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {bd.tablas.map((t) => (
                      <tr key={t.nombre}>
                        <td className="py-1 pr-2 font-mono text-[10px] text-slate-600">
                          {t.nombre}
                        </td>
                        <td className="py-1 text-right font-medium text-slate-700">{t.tamano}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ====== CRONS ====== */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-semibold text-slate-900">Jobs programados</h2>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Job</th>
                <th className="px-2 py-2 text-left font-medium">Estado</th>
                <th className="px-2 py-2 text-left font-medium">Último run</th>
                <th className="px-2 py-2 text-left font-medium">Duración</th>
                <th className="px-2 py-2 text-left font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {crons.map((c) => {
                const chip = chipEstado(c);
                const Icon = chip.Icon;
                return (
                  <tr key={c.jobName}>
                    <td className="px-2 py-2 align-top">
                      <p className="font-mono text-[11px] text-slate-700">{c.jobName}</p>
                      <p className="text-[10px] text-slate-500">{c.descripcion}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Esperado cada {fmtHoras(c.intervaloHoras)}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${chip.clase}`}
                      >
                        <Icon className="h-3 w-3" />
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {c.ultimo ? (
                        <>
                          <p className="text-[11px] text-slate-700">
                            {c.ultimo.startedAt.toLocaleString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            hace {fmtHoras(c.horasDesdeUltimo)}
                          </p>
                        </>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {c.ultimo?.durationMs != null ? (
                        <p className="font-mono text-[11px] text-slate-700">
                          {c.ultimo.durationMs}ms
                        </p>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {c.ultimo?.error ? (
                        <p
                          className="line-clamp-2 text-[10px] text-rose-700"
                          title={c.ultimo.error}
                        >
                          {c.ultimo.error.split('\n')[0]}
                        </p>
                      ) : c.ultimo?.output ? (
                        <p className="text-[11px] text-slate-700">{c.ultimo.output}</p>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ====== BOT COLPATRIA ====== */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand-blue" />
            <h2 className="text-sm font-semibold text-slate-900">Bot Colpatria ARL</h2>
          </div>
          <Link
            href="/admin/configuracion/colpatria-jobs"
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
          >
            Ver todos los jobs
            <ArrowRight className="h-3 w-3" />
          </Link>
        </header>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Counters 24h */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Últimas 24h</p>
            <div className="grid grid-cols-5 gap-2">
              {[
                {
                  label: 'Pending',
                  v: colpatria.ultimas24h.pending,
                  c: 'bg-slate-100 text-slate-700',
                },
                {
                  label: 'Running',
                  v: colpatria.ultimas24h.running,
                  c: 'bg-blue-50 text-blue-700',
                },
                {
                  label: 'Success',
                  v: colpatria.ultimas24h.success,
                  c: 'bg-emerald-50 text-emerald-700',
                },
                {
                  label: 'Retry',
                  v: colpatria.ultimas24h.retryable,
                  c: 'bg-amber-50 text-amber-800',
                },
                {
                  label: 'Failed',
                  v: colpatria.ultimas24h.failed,
                  c: 'bg-rose-50 text-rose-700',
                },
              ].map((s) => (
                <div key={s.label} className={`rounded-md px-2 py-1.5 text-center ${s.c}`}>
                  <p className="text-lg font-semibold leading-none">{s.v}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-wider opacity-70">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Total histórico: <strong>{colpatria.totalHistorico}</strong> jobs
            </p>
          </div>

          {/* Empresas + alerta de pending viejos */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Empresas</p>
            <div className="space-y-1 text-xs">
              <p className="text-slate-700">
                <strong>{colpatria.empresas.configuradas}</strong> con credenciales configuradas
              </p>
              <p className="text-slate-700">
                <strong>{colpatria.empresas.activas}</strong> con bot activo
              </p>
            </div>

            {colpatria.pendingMasViejoH != null && colpatria.pendingMasViejoH > 1 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Hay un job PENDING de hace{' '}
                  <strong>{colpatria.pendingMasViejoH.toFixed(1)}h</strong>. ¿Está corriendo el
                  worker?
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====== UPLOADS ====== */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-3 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-semibold text-slate-900">Uploads en disco</h2>
        </header>

        {uploads.archivos == null ? (
          <p className="text-xs italic text-slate-500">
            Directorio sin archivos o no accesible:{' '}
            <span className="font-mono">{uploads.rutaConfigurada}</span>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Archivos</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">{uploads.archivos}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Tamaño total</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">
                {uploads.tamanoTotalLegible}
              </p>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Ruta</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-slate-600">
                {uploads.rutaConfigurada}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
