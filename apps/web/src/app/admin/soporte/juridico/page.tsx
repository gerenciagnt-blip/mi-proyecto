import Link from 'next/link';
import { Scale, MessageSquare } from 'lucide-react';
import { requirePermiso } from '@/lib/auth-helpers';
import { cn } from '@/lib/utils';
import { IncapacidadesSection } from './_components/incapacidades-section';
import { PqrsSection } from './_components/pqrs-section';

export const metadata = { title: 'Jurídico · Soporte — Sistema PILA' };
export const dynamic = 'force-dynamic';

type Seccion = 'incapacidades' | 'pqrs';

type SP = {
  q?: string;
  estado?: string;
  tipo?: string;
  seccion?: string;
};

const SECCIONES: {
  key: Seccion;
  label: string;
  icon: typeof Scale;
  descripcion: string;
}[] = [
  {
    key: 'incapacidades',
    label: 'Incapacidades',
    icon: Scale,
    descripcion:
      'Casos de incapacidad derivados al área legal. Los documentos confidenciales del proceso solo son descargables por usuarios con permiso jurídico.',
  },
  {
    key: 'pqrs',
    label: 'PQRS',
    icon: MessageSquare,
    descripcion:
      'Peticiones, quejas, reclamos, sugerencias y felicitaciones radicadas desde el sitio público. Plazos legales según Ley 1755/2015.',
  },
];

/**
 * Bandeja Soporte / Jurídico — shell con dos secciones internas:
 *
 *  • Incapacidades — casos en flujo legal (TRASLADO_A_JURIDICO o
 *    EN_PROCESO_JURIDICO).
 *  • PQRS — solicitudes recibidas desde la landing pública.
 *
 * Visible a TODO STAFF (ADMIN/SOPORTE). La sección activa se controla
 * con el searchParam `?seccion=incapacidades|pqrs` (default
 * incapacidades).
 */
export default async function JuridicoBandejaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermiso('soporte.juridico');
  const sp = await searchParams;
  const seccion: Seccion = sp.seccion === 'pqrs' ? 'pqrs' : 'incapacidades';
  const meta = SECCIONES.find((s) => s.key === seccion)!;
  const q = sp.q?.trim() ?? '';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
          <Scale className="h-6 w-6 text-brand-blue" />
          Soporte · Jurídico
        </h1>
        <p className="mt-1 text-sm text-slate-500">{meta.descripcion}</p>
      </header>

      {/* Tabs */}
      <nav className="border-b border-slate-200">
        <div className="-mb-px flex gap-4">
          {SECCIONES.map((s) => {
            const Icon = s.icon;
            const active = seccion === s.key;
            // Al cambiar de tab limpiamos los searchParams del otro
            // (los filtros de cada sección no aplican a la otra).
            const href =
              s.key === 'incapacidades'
                ? '/admin/soporte/juridico'
                : '/admin/soporte/juridico?seccion=pqrs';
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
      {seccion === 'incapacidades' ? <IncapacidadesSection q={q} /> : <PqrsSection sp={sp} />}
    </div>
  );
}
