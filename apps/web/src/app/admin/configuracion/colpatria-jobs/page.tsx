import Link from 'next/link';
import { Bot, ListChecks, KeyRound } from 'lucide-react';
import { requirePermiso } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';
import { JobsSection, type JobsSectionParams } from './_components/jobs-section';
import { SesionesSection } from './_components/sesiones-section';

export const metadata = { title: 'Bot Colpatria — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Seccion = 'jobs' | 'sesiones';

type SP = JobsSectionParams & { seccion?: string };

const SECCIONES: { key: Seccion; label: string; icon: typeof ListChecks; descripcion: string }[] = [
  {
    key: 'jobs',
    label: 'Jobs',
    icon: ListChecks,
    descripcion:
      'Histórico de afiliaciones procesadas (o por procesar) en el portal Colpatria. Solo STAFF.',
  },
  {
    key: 'sesiones',
    label: 'Sesiones',
    icon: KeyRound,
    descripcion: 'Estado de inicio/cierre de sesión por empresa. Disparo manual de login/logout.',
  },
];

export default async function BotColpatriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermiso('config.colpatria_jobs');

  const sp = await searchParams;
  const seccionRaw = sp.seccion;
  const seccion: Seccion = seccionRaw === 'sesiones' ? 'sesiones' : 'jobs';
  // SECCIONES tiene los 2 valores de Seccion → siempre encuentra match.
  // El `!` documenta el invariante a TS.
  const meta = SECCIONES.find((s) => s.key === seccion)!;

  return (
    <div className="space-y-6">
      {/* Header común */}
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Bot className="h-6 w-6 text-brand-blue" />
          Bot Colpatria ARL
        </h1>
        <p className="mt-1 text-sm text-slate-500">{meta.descripcion}</p>
      </header>

      {/* Tabs internos */}
      <nav className="border-b border-slate-200">
        <div className="-mb-px flex gap-4">
          {SECCIONES.map((s) => {
            const Icon = s.icon;
            const active = seccion === s.key;
            // Cuando cambias de tab limpiamos los searchParams del otro
            // (ej: filtros de Jobs no aplican a Sesiones).
            const href =
              s.key === 'jobs' ? '/admin/configuracion/colpatria-jobs' : '?seccion=sesiones';
            return (
              <Link
                key={s.key}
                href={href}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition',
                  active
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Contenido */}
      {seccion === 'jobs' ? <JobsSection sp={sp} /> : <SesionesSection />}
    </div>
  );
}
