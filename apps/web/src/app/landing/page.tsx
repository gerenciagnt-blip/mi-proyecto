import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Zap,
  BarChart3,
  Building2,
  User,
  FileSpreadsheet,
  Wallet,
  Scale,
  Upload,
  Cog,
  CreditCard,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Plus,
  Minus,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ParaQuien />
        <Servicios />
        <ComoFunciona />
        <Numeros />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-12">
        <Link href="/landing" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Sistema PILA" width={32} height={32} priority />
          <span className="font-heading text-lg font-bold tracking-tight text-slate-900">
            Sistema PILA
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#servicios" className="transition hover:text-slate-900">
            Servicios
          </a>
          <a href="#para-quien" className="transition hover:text-slate-900">
            Para quién
          </a>
          <a href="#como-funciona" className="transition hover:text-slate-900">
            Cómo funciona
          </a>
          <a href="#contacto" className="transition hover:text-slate-900">
            Contacto
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-900 sm:inline-flex"
          >
            Ingresar
          </Link>
          <a
            href="#contacto"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-brand transition hover:shadow-brand-lg"
          >
            Solicitar demo
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-gradient-to-b from-brand-blue/[0.04] via-brand-turquoise/[0.03] to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-20 -z-10 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-brand-blue/10 to-brand-turquoise/10 blur-3xl"
        aria-hidden
      />

      <div className="mx-auto max-w-7xl px-6 pb-24 pt-16 sm:pt-24 lg:px-12 lg:pb-32 lg:pt-32">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-blue/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-blue-dark">
              <Sparkles className="h-3 w-3" />
              Operador autorizado en Colombia
            </span>

            <h1 className="mt-6 font-heading text-5xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              Tu seguridad social{' '}
              <span className="bg-gradient-to-r from-brand-blue to-brand-turquoise bg-clip-text text-transparent">
                a un click.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl">
              Plataforma integral de PILA, ARL y cartera. Afiliamos cotizantes automáticamente,
              operamos por ti y te damos visibilidad en tiempo real. Hecho para empresas del sector
              de la seguridad social e independientes.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="#contacto"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-gradient px-6 text-sm font-semibold text-white shadow-brand transition hover:shadow-brand-lg"
              >
                Solicitar demo
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#contacto"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Contactar comercial
              </a>
            </div>

            <dl className="mt-12 grid grid-cols-3 gap-6 text-xs">
              <MiniFeature icon={ShieldCheck} label="100% conforme PILA" />
              <MiniFeature icon={Zap} label="Afiliación en minutos" />
              <MiniFeature icon={BarChart3} label="Reportes en vivo" />
            </dl>
          </div>

          <div className="lg:col-span-6">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniFeature({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Icon className="h-4 w-4 text-brand-blue" />
      <dt className="font-medium text-slate-900">{label}</dt>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-float">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="ml-2 font-mono text-[10px] text-slate-400">sistema-pila.com/admin</span>
        </div>

        <div className="bg-gradient-to-br from-brand-blue/5 to-brand-turquoise/5 px-6 py-5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Planillas del mes
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-slate-900">$ 142.580.300</p>
          <p className="mt-1 text-[11px] text-emerald-600">↑ 12% vs mes anterior</p>
        </div>

        <div className="grid grid-cols-3 gap-3 px-6 py-4">
          <MockStat label="Cotizantes" value="1,247" tone="blue" />
          <MockStat label="Empresas" value="84" tone="green" />
          <MockStat label="Pagadas" value="92%" tone="turquoise" />
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Actividad reciente
          </p>
          <ul className="mt-3 space-y-2.5">
            <MockRow tone="emerald" label="PLA-001284 pagada" sub="Acme S.A.S · hace 2 min" />
            <MockRow tone="amber" label="Afiliando 14 cotizantes" sub="ARL · en curso" />
            <MockRow tone="blue" label="Nuevo aliado registrado" sub="Bogotá D.C. · hace 1 h" />
          </ul>
        </div>
      </div>

      <div className="absolute -right-6 -top-6 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-card-float lg:block">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Afiliación ARL
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-900">Procesando</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">14 cotizantes en cola</p>
      </div>

      <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-card-float lg:block">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Cartera</p>
        <p className="mt-1 font-heading text-xl font-bold text-slate-900">$ 8.2M</p>
        <p className="text-[10px] text-amber-600">3 casos en gestión</p>
      </div>
    </div>
  );
}

function MockStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'turquoise';
}) {
  const toneCls = {
    blue: 'border-brand-blue/20 bg-brand-blue/5 text-brand-blue-dark',
    green: 'border-brand-green/20 bg-brand-green/5 text-brand-green-dark',
    turquoise: 'border-brand-turquoise/20 bg-brand-turquoise/5 text-brand-blue-dark',
  }[tone];
  return (
    <div className={`rounded-lg border ${toneCls} px-3 py-2`}>
      <p className="text-[9px] font-medium uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-0.5 font-mono text-base font-bold">{value}</p>
    </div>
  );
}

function MockRow({
  tone,
  label,
  sub,
}: {
  tone: 'emerald' | 'amber' | 'blue';
  label: string;
  sub: string;
}) {
  const dotCls = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    blue: 'bg-brand-blue',
  }[tone];
  return (
    <li className="flex items-center gap-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800">{label}</p>
        <p className="truncate text-[10px] text-slate-500">{sub}</p>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// PARA QUIÉN
// ─────────────────────────────────────────────────────────────
function ParaQuien() {
  return (
    <section
      id="para-quien"
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Para quién"
          title="Hecho para empresas del sector de la seguridad social e independientes."
          description="Plataforma para asesores, operadores y empresas del sector que gestionan seguridad social — y para independientes que cotizan por su cuenta."
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <AudienciaCard
            icon={Building2}
            tag="Empresas del sector"
            title="Para tu operación de seguridad social"
            description="Plataforma multi-aliado para asesores, operadores PILA y empresas del sector. Centraliza tus sucursales, automatiza la afiliación de cotizantes a ARL y entrega visibilidad ejecutiva por aliado."
            features={[
              'Planillas tipo E e I generadas y validadas automáticamente',
              'Afiliación automática de cotizantes a ARL — 1.500+ al mes sin entrar a portales',
              'Cartera unificada con bitácora de gestiones y reportes por sucursal',
              'Soporte jurídico cuando una incapacidad escala al área legal',
            ]}
            ctaLabel="Soluciones para empresas del sector"
          />
          <AudienciaCard
            icon={User}
            tag="Independientes"
            title="Para que cotices sin complicaciones"
            description="Tú te enfocas en tu trabajo, nosotros nos encargamos del resto. Pagas tu PILA cada mes con un click, sin trámites ni filas."
            features={[
              'Planilla tipo I generada según tu IBC del mes',
              'Pago seguro vía PSE con tu banco habitual',
              'Comprobantes oficiales descargables en cualquier momento',
              'Sin contratos largos ni cargos ocultos',
            ]}
            ctaLabel="Soluciones para independientes"
          />
        </div>
      </div>
    </section>
  );
}

function AudienciaCard({
  icon: Icon,
  tag,
  title,
  description,
  features,
  ctaLabel,
}: {
  icon: typeof Building2;
  tag: string;
  title: string;
  description: string;
  features: string[];
  ctaLabel: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-card-float lg:p-10">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
          {tag}
        </span>
      </div>

      <h3 className="mt-6 font-heading text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h3>
      <p className="mt-3 text-base text-slate-600">{description}</p>

      <ul className="mt-6 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a
        href="#contacto"
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue-dark transition group-hover:gap-2.5"
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </a>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────
function Servicios() {
  const items = [
    {
      icon: FileSpreadsheet,
      tone: 'blue' as const,
      title: 'Planillas PILA',
      description:
        'Genera, valida y paga planillas tipo E (empleados) e I (independientes) desde un solo lugar. Integración directa con PagoSimple para pago vía PSE.',
    },
    {
      icon: ShieldCheck,
      tone: 'turquoise' as const,
      title: 'Afiliación automática a ARL',
      description:
        'Afiliamos a tus cotizantes a la ARL de forma automática, sin que tu equipo tenga que entrar a portales externos. 1.500+ afiliaciones al mes con captura de comprobante oficial.',
    },
    {
      icon: Wallet,
      tone: 'green' as const,
      title: 'Cartera y cobranza',
      description:
        'Estado de cuenta unificado de EPS, AFP, ARL y CCF. Gestiones de cobro registradas con bitácora completa y reportes ejecutivos al cierre.',
    },
    {
      icon: Scale,
      tone: 'indigo' as const,
      title: 'Soporte jurídico',
      description:
        'Cuando una incapacidad se complica, nuestro equipo legal toma el caso. Documentos confidenciales protegidos por permisos granulares.',
    },
  ];

  return (
    <section id="servicios" className="px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Servicios"
          title="Una sola plataforma. Todo lo que tu seguridad social necesita."
          description="Sin saltar entre 5 portales distintos ni perseguir a los operadores. Centralizado y automatizado."
        />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <ServicioCard key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ServicioCard({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: typeof FileSpreadsheet;
  tone: 'blue' | 'turquoise' | 'green' | 'indigo';
  title: string;
  description: string;
}) {
  const toneCls = {
    blue: 'bg-brand-blue/10 text-brand-blue',
    turquoise: 'bg-brand-turquoise/10 text-brand-turquoise',
    green: 'bg-brand-green/10 text-brand-green',
    indigo: 'bg-indigo-100 text-indigo-700',
  }[tone];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-brand-blue/30 hover:shadow-card-float">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 font-heading text-lg font-bold tracking-tight text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// CÓMO FUNCIONA
// ─────────────────────────────────────────────────────────────
function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Cómo funciona"
          title="3 pasos. Sin fricción."
          description="Desde que cargas tus cotizantes hasta que tienes la planilla pagada, todo el flujo es transparente."
        />

        <div className="mt-16 grid gap-8 lg:grid-cols-3 lg:gap-6">
          <PasoCard
            num="01"
            icon={Upload}
            title="Subes o registras"
            description="Importas tu base de cotizantes desde Excel o registras independientes uno a uno. Validamos los datos contra DIVIPOLA y SGSS al instante."
          />
          <PasoCard
            num="02"
            icon={Cog}
            title="Generamos por ti"
            description="Calculamos liquidaciones, agrupamos por empresa o independiente, y consolidamos las planillas. Las afiliaciones a ARL corren en paralelo de forma automática."
          />
          <PasoCard
            num="03"
            icon={CreditCard}
            title="Pagas y listo"
            description="Validas la planilla en PagoSimple y pagas vía PSE con tu banco. Recibes comprobante oficial y trazabilidad completa."
          />
        </div>
      </div>
    </section>
  );
}

function PasoCard({
  num,
  icon: Icon,
  title,
  description,
}: {
  num: string;
  icon: typeof Upload;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-8">
      <span className="absolute right-6 top-6 font-heading text-5xl font-bold text-slate-100">
        {num}
      </span>
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-6 font-heading text-xl font-bold tracking-tight text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NÚMEROS
// ─────────────────────────────────────────────────────────────
function Numeros() {
  const stats = [
    { value: '1.500+', label: 'Afiliaciones mensuales automatizadas' },
    { value: '100%', label: 'Conformidad con la Resolución 2388/2016' },
    { value: '<5 min', label: 'Para generar y validar una planilla' },
    { value: '24/7', label: 'Disponibilidad de la plataforma' },
  ];
  return (
    <section className="relative overflow-hidden px-6 py-24 lg:px-12">
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-blue/95 via-brand-blue-dark to-brand-blue-dark"
        aria-hidden
      />
      <div
        className="absolute -right-20 -top-20 -z-10 h-[400px] w-[400px] rounded-full bg-brand-turquoise/20 blur-3xl"
        aria-hidden
      />
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
            En números
          </span>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            La operación que respalda tu día a día.
          </h2>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
                {s.value}
              </p>
              <p className="mt-2 text-sm text-white/70">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────
function Faq() {
  const items: { q: string; a: string }[] = [
    {
      q: '¿Qué es exactamente Sistema PILA?',
      a: 'Somos una plataforma SaaS que opera la Planilla Integrada de Liquidación de Aportes (PILA) por ti. Calculamos, validamos y pagamos tus aportes a EPS, AFP, ARL y caja de compensación; además automatizamos afiliaciones a ARL Colpatria y manejamos la cartera con tus aportantes.',
    },
    {
      q: '¿Trabajan con todas las EPS y ARL?',
      a: 'Sí. PILA es un estándar nacional, así que aplica para todas las EPS, AFP, ARL y CCF activas en Colombia. La afiliación automática de cotizantes está disponible actualmente para una ARL; el resto están en roadmap.',
    },
    {
      q: '¿Cómo se factura el servicio?',
      a: 'Trabajamos con dos modelos: para empresas, una tarifa mensual por cotizante activo; para independientes, una comisión transparente sobre el aporte. Sin cargos ocultos, sin contratos de permanencia.',
    },
    {
      q: '¿Mi información es segura?',
      a: 'Sí. La plataforma corre sobre infraestructura cifrada, las credenciales de portales externos se guardan con AES-256-GCM, y todas las acciones quedan registradas en bitácora. Cumplimos con la Ley 1581 de 2012 (Habeas Data).',
    },
    {
      q: '¿Cuánto demora la implementación?',
      a: 'Para independientes, minutos: registras tu información, validamos y empiezas a cotizar el siguiente periodo. Para empresas, depende del tamaño — una empresa típica de 50 empleados se onboarda en 24-48 horas con acompañamiento.',
    },
    {
      q: '¿Tienen soporte jurídico?',
      a: 'Sí. Si una incapacidad o trámite se complica, el caso pasa automáticamente a nuestro flujo jurídico interno con trazabilidad completa, gestión documental confidencial y permisos granulares para el área legal.',
    },
  ];

  return (
    <section id="faq" className="px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Preguntas frecuentes"
          title="Respuestas claras."
          description="Si tu pregunta no está acá, escríbenos directamente — respondemos en menos de un día hábil."
          centered
        />
        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {items.map((it, i) => (
            <details key={i} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50">
                <span className="font-heading text-base font-semibold text-slate-900 sm:text-lg">
                  {it.q}
                </span>
                <Plus className="h-5 w-5 shrink-0 text-slate-400 transition group-open:hidden" />
                <Minus className="hidden h-5 w-5 shrink-0 text-slate-400 transition group-open:block" />
              </summary>
              <div className="px-6 pb-5 text-sm leading-relaxed text-slate-600 sm:text-base">
                {it.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// CTA FINAL
// ─────────────────────────────────────────────────────────────
function CtaFinal() {
  return (
    <section
      id="contacto"
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-10 shadow-card-float sm:p-16">
          <div
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <div
            className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <div className="relative">
            <h2 className="max-w-3xl font-heading text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              ¿Listo para que operemos tu seguridad social?
            </h2>
            <p className="mt-5 max-w-2xl text-base text-white/85 sm:text-lg">
              Solicita una demo guiada con un asesor o escríbenos directamente. Sin compromiso.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="mailto:gerencia.gnt@gmail.com?subject=Solicitud%20de%20demo%20Sistema%20PILA"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-brand-blue-dark shadow-lg transition hover:bg-slate-50"
              >
                Solicitar demo
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="mailto:gerencia.gnt@gmail.com?subject=Contacto%20comercial%20Sistema%20PILA"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/40 bg-transparent px-6 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contactar comercial
              </a>
            </div>

            <div className="mt-10 grid gap-4 border-t border-white/20 pt-8 text-sm text-white/85 sm:grid-cols-3">
              <ContactoItem icon={Mail} label="gerencia.gnt@gmail.com" />
              <ContactoItem icon={Phone} label="+57 (1) 000 0000" />
              <ContactoItem icon={MapPin} label="Bogotá D.C., Colombia" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactoItem({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-white/70" />
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-white px-6 py-16 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/landing" className="flex items-center gap-2">
              <Image src="/logo.svg" alt="Sistema PILA" width={32} height={32} />
              <span className="font-heading text-lg font-bold tracking-tight text-slate-900">
                Sistema PILA
              </span>
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">
              Operador autorizado de PILA, ARL y cartera en Colombia. Plataforma integral para
              empresas e independientes que necesitan simplicidad y trazabilidad en su seguridad
              social.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            <FooterColumn
              title="Servicios"
              links={[
                { label: 'Planillas PILA', href: '#servicios' },
                { label: 'Afiliación a ARL', href: '#servicios' },
                { label: 'Cartera', href: '#servicios' },
                { label: 'Jurídico', href: '#servicios' },
              ]}
            />
            <FooterColumn
              title="Empresa"
              links={[
                { label: 'Para quién', href: '#para-quien' },
                { label: 'Cómo funciona', href: '#como-funciona' },
                { label: 'Contacto', href: '#contacto' },
                { label: 'Ingresar al sistema', href: '/login' },
              ]}
            />
            <FooterColumn
              title="Legal"
              links={[
                { label: 'Términos de uso', href: '#' },
                { label: 'Política de privacidad', href: '#' },
                { label: 'Habeas Data', href: '#' },
                { label: 'PQRS', href: '#contacto' },
              ]}
            />
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-slate-100 pt-8 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>© {year} Sistema PILA. Todos los derechos reservados.</p>
          <p>Bogotá D.C. · Colombia</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-sm text-slate-700 transition hover:text-slate-900">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function SectionHeading({
  eyebrow,
  title,
  description,
  centered,
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl'}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-blue/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-blue-dark">
        {eyebrow}
      </span>
      <h2 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">{description}</p>
    </div>
  );
}
