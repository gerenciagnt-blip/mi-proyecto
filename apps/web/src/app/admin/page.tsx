import Link from 'next/link';
import {
  Building2,
  Briefcase,
  Users,
  Database,
  ArrowRight,
  Wallet,
  HeartPulse,
  FolderArchive,
  ArrowRightLeft,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { prisma } from '@pila/db';
import { auth } from '@/auth';
import { getUserScope } from '@/lib/sucursal-scope';
import { esStaff } from '@/lib/auth-helpers';
import { formatCOP } from '@/lib/format';
import { CobrosPendientesBanner } from './cobros-pendientes-banner';

export const metadata = { title: 'Administración — Sistema PILA' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const session = await auth();
  if (!session?.user) return null;

  if (esStaff(session.user.role)) {
    return <StaffHub />;
  }
  return <AliadoDashboard />;
}

// ============ Hub Staff (ADMIN / SOPORTE) ============

async function StaffHub() {
  const [sucursales, empresas, usuarios, entidades, actividades, tiposCot] = await Promise.all([
    prisma.sucursal.count(),
    prisma.empresa.count(),
    prisma.user.count(),
    prisma.entidadSgss.count(),
    prisma.actividadEconomica.count(),
    prisma.tipoCotizante.count(),
  ]);

  const cards = [
    {
      href: '/admin/sucursales',
      label: 'Sucursales',
      count: sucursales,
      icon: Building2,
      accent: 'from-brand-blue to-brand-turquoise',
    },
    {
      href: '/admin/empresas',
      label: 'Empresas',
      count: empresas,
      icon: Briefcase,
      accent: 'from-brand-blue to-brand-green',
    },
    {
      href: '/admin/usuarios',
      label: 'Usuarios',
      count: usuarios,
      icon: Users,
      accent: 'from-brand-green to-brand-turquoise',
    },
    {
      href: '/admin/catalogos',
      label: 'Catálogos',
      count: entidades + actividades + tiposCot,
      icon: Database,
      accent: 'from-brand-turquoise to-brand-blue',
      sub: `${entidades} entidades SGSS · ${actividades} CIIU · ${tiposCot} tipos cotizante`,
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Visión general del sistema. Da clic en cualquier sección para administrarla.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-brand"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.accent}`}
                aria-hidden
              />
              <div className="flex items-start justify-between">
                <Icon className="h-6 w-6 text-slate-400 transition group-hover:text-brand-blue" />
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-blue" />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                {c.label}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
                {c.count}
              </p>
              {c.sub && <p className="mt-1 text-[11px] text-slate-500">{c.sub}</p>}
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Próximos pasos
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>• Cargar los catálogos base (ARL, CIIU, tipos cotizante) antes de crear empresas</li>
          <li>• Crear sucursales y sus usuarios aliados</li>
          <li>
            • Configurar la pestaña PILA de cada empresa (niveles, actividades, cotizantes
            permitidos)
          </li>
        </ul>
      </section>
    </div>
  );
}

// ============ Dashboard Aliado (ALIADO_OWNER / ALIADO_USER) ============

async function AliadoDashboard() {
  const scope = await getUserScope();
  if (!scope || scope.tipo !== 'SUCURSAL') return null;

  const sucursalId = scope.sucursalId;

  const [
    cotizantesActivos,
    carteraRealStats,
    incapacidadesPendientes,
    incapacidadesPagadas,
    sucursal,
    cobrosPendientes,
  ] = await Promise.all([
    prisma.cotizante.count({
      where: { sucursalId, afiliaciones: { some: { estado: 'ACTIVA' } } },
    }),
    prisma.carteraDetallado.aggregate({
      where: { sucursalAsignadaId: sucursalId, estado: 'CARTERA_REAL' },
      _count: { _all: true },
      _sum: { valorCobro: true },
    }),
    prisma.incapacidad.count({
      where: {
        sucursalId,
        estado: { in: ['RADICADA', 'EN_REVISION', 'APROBADA'] },
      },
    }),
    prisma.incapacidad.count({
      where: { sucursalId, estado: 'PAGADA' },
    }),
    prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { codigo: true, nombre: true, bloqueadaPorMora: true },
    }),
    // Cobros PENDIENTES o VENCIDOS del aliado (para el banner)
    prisma.cobroAliado.findMany({
      where: { sucursalId, estado: { in: ['PENDIENTE', 'VENCIDO'] } },
      orderBy: { fechaLimite: 'asc' },
      include: {
        periodo: { select: { anio: true, mes: true } },
      },
    }),
  ]);

  const cards = [
    {
      href: '/admin/base-datos',
      label: 'Cotizantes activos',
      count: cotizantesActivos,
      icon: Users,
      tone: 'sky',
      desc: 'Afiliaciones vigentes en tu sucursal',
    },
    {
      href: '/admin/administrativo/cartera',
      label: 'Cartera real pendiente',
      count: carteraRealStats._count._all,
      icon: AlertCircle,
      tone: 'violet',
      desc: formatCOP(Number(carteraRealStats._sum.valorCobro ?? 0)),
    },
    {
      href: '/admin/administrativo/incapacidades?tab=historico',
      label: 'Incapacidades en proceso',
      count: incapacidadesPendientes,
      icon: HeartPulse,
      tone: 'amber',
      desc: 'Radicadas, en revisión o aprobadas',
    },
    {
      href: '/admin/administrativo/incapacidades?tab=historico&estado=PAGADA',
      label: 'Incapacidades pagadas',
      count: incapacidadesPagadas,
      icon: CheckCircle2,
      tone: 'emerald',
      desc: 'Histórico',
    },
  ];

  const accesosRapidos = [
    {
      href: '/admin/transacciones',
      label: 'Generar transacción',
      icon: ArrowRightLeft,
    },
    {
      href: '/admin/base-datos',
      label: 'Crear / buscar afiliación',
      icon: FolderArchive,
    },
    {
      href: '/admin/planos',
      label: 'Planos PILA',
      icon: FileSpreadsheet,
    },
    {
      href: '/admin/administrativo/incapacidades',
      label: 'Radicar incapacidad',
      icon: HeartPulse,
    },
    {
      href: '/admin/administrativo/cartera',
      label: 'Gestionar cartera real',
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Sucursal {sucursal?.codigo ?? '—'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {sucursal?.nombre ?? 'Panel del aliado'} · Resumen de tu operación.
        </p>
      </header>

      {/* Banner de cobros pendientes / vencidos */}
      {cobrosPendientes.length > 0 && (
        <CobrosPendientesBanner
          cobros={cobrosPendientes.map((c) => ({
            id: c.id,
            consecutivo: c.consecutivo,
            total: Number(c.totalCobro),
            fechaLimite: c.fechaLimite,
            estado: c.estado as 'PENDIENTE' | 'VENCIDO',
            periodoAnio: c.periodo.anio,
            periodoMes: c.periodo.mes,
          }))}
          bloqueadaPorMora={sucursal?.bloqueadaPorMora ?? false}
        />
      )}

      {/* Stats aliado */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-brand"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-${c.tone}-50 text-${c.tone}-700`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-blue" />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                {c.label}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900">
                {c.count}
              </p>
              {c.desc && <p className="mt-1 text-[11px] text-slate-500">{c.desc}</p>}
            </Link>
          );
        })}
      </div>

      {/* Accesos rápidos */}
      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold uppercase tracking-wider text-slate-500">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {accesosRapidos.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue hover:text-brand-blue-dark hover:shadow-brand"
              >
                <Icon className="h-4 w-4 text-slate-400 group-hover:text-brand-blue" />
                <span className="flex-1 text-xs font-medium">{a.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-brand-blue" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          <Clock3 className="h-4 w-4" />
          Tips del día
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>• Revisa cartera real para evitar intereses de mora con las entidades SGSS.</li>
          <li>
            • Radica la incapacidad adjuntando al menos el certificado original; los demás
            documentos son deseables.
          </li>
          <li>
            • Los documentos de incapacidad se conservan 120 días en el sistema; después queda el
            registro como evidencia.
          </li>
        </ul>
      </section>
    </div>
  );
}
