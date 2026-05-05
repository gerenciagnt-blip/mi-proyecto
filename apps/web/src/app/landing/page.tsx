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
  HeartPulse,
  Upload,
  Cog,
  CreditCard,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Plus,
  Minus,
  MessageCircle,
} from 'lucide-react';
import { waUrl, WA_MENSAJES } from './_components/whatsapp';
import { WhatsappFloat } from './_components/whatsapp-float';
import { SolicitarDemoForm } from './_components/solicitar-demo-form';

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
      <WhatsappFloat />
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
        <Link href="/landing" className="flex items-center" aria-label="Sistema PILA">
          {/* Logo horizontal del SVG ya incluye el wordmark — usamos
              dimensiones proporcionales al ratio 1509.4:352.87 (~4.28:1).
              Altura 36px en mobile, 40px en desktop para presencia. */}
          <Image
            src="/logo-horizontal.svg"
            alt="Sistema PILA"
            width={172}
            height={40}
            priority
            className="h-9 w-auto sm:h-10"
          />
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

      <div className="mx-auto max-w-7xl px-6 pb-16 pt-12 sm:pt-16 lg:px-12 lg:pb-20 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-blue/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-blue-dark">
              <Sparkles className="h-3 w-3" />
              Aliado de operador autorizado en Colombia
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
                href={waUrl(WA_MENSAJES.contactoComercial)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <MessageCircle className="h-4 w-4 text-[#25D366]" />
                Contactar por WhatsApp
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
    // Perspectiva 3D pura CSS — sin Three.js / Spline. Da profundidad
    // tipo Stripe/Linear con costo cero (es una transformación nativa
    // del browser). Solo se aplica en lg+ porque en mobile el rotateY
    // genera espacio horizontal que rompe el layout.
    <div className="relative lg:[perspective:1500px]" style={{ transformStyle: 'preserve-3d' }}>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-float transition-transform duration-700 ease-out lg:[transform:rotateY(-6deg)_rotateX(3deg)] lg:hover:[transform:rotateY(-2deg)_rotateX(1deg)]">
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
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-16 lg:px-12 lg:py-20"
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
        'Genera, valida y paga planillas tipo E (empleados) e I (independientes) desde un solo lugar. Integración directa con el operador autorizado para pago vía PSE.',
    },
    {
      icon: ShieldCheck,
      tone: 'turquoise' as const,
      title: 'Afiliación automática a ARL',
      description:
        'Afiliamos a tus cotizantes a la ARL de forma automática, sin que tu equipo tenga que entrar a portales externos. 1.500+ afiliaciones al mes con captura de comprobante oficial.',
    },
    {
      icon: HeartPulse,
      tone: 'rose' as const,
      title: 'Radicación y gestión de incapacidades',
      description:
        'Radica incapacidades y sigue el caso completo: radicación, revisión, aprobación y pago. Bitácora unificada con tu equipo y escalamiento automático al área jurídica cuando es necesario.',
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
        'Cuando una incapacidad se complica, nuestro equipo legal toma el caso. Documentos confidenciales (derecho de petición, tutela, desacato, resolución) protegidos por permisos granulares.',
    },
  ];

  return (
    <section id="servicios" className="px-6 py-16 lg:px-12 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Servicios"
          title="Una sola plataforma. Todo lo que tu seguridad social necesita."
          description="Sin saltar entre 5 portales distintos ni perseguir a los operadores. Centralizado y automatizado."
        />

        {/* 5 servicios — grid 3 cols en lg+: 3 arriba, 2 abajo. La fila
            inferior queda alineada a la izquierda (patrón estándar). */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
  tone: 'blue' | 'turquoise' | 'green' | 'indigo' | 'rose';
  title: string;
  description: string;
}) {
  const toneCls = {
    blue: 'bg-brand-blue/10 text-brand-blue',
    turquoise: 'bg-brand-turquoise/10 text-brand-turquoise',
    green: 'bg-brand-green/10 text-brand-green',
    indigo: 'bg-indigo-100 text-indigo-700',
    rose: 'bg-rose-100 text-rose-700',
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
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-16 lg:px-12 lg:py-20"
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
            visual={<MockTablaCotizantes />}
          />
          <PasoCard
            num="02"
            icon={Cog}
            title="Generamos por ti"
            description="Calculamos liquidaciones, agrupamos por empresa o independiente, y consolidamos las planillas. Las afiliaciones a ARL corren en paralelo de forma automática."
            visual={<MockProgresoGenerar />}
          />
          <PasoCard
            num="03"
            icon={CreditCard}
            title="Pagas y listo"
            description="Validas la planilla en PagoSimple y pagas vía PSE con tu banco. Recibes comprobante oficial y trazabilidad completa."
            visual={<MockPagoConfirmado />}
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
  visual,
}: {
  num: string;
  icon: typeof Upload;
  title: string;
  description: string;
  visual: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8">
      <span className="absolute right-6 top-6 font-heading text-5xl font-bold text-slate-100">
        {num}
      </span>
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-6 font-heading text-xl font-bold tracking-tight text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-6">{visual}</div>
    </div>
  );
}

/**
 * Mini-mockup paso 1 — tabla de cotizantes con rows que aparecen
 * de a poco. Animación CSS pura con `animate-fade-in` (ya definido
 * en tailwind.config) + delay escalonado vía inline style.
 */
function MockTablaCotizantes() {
  const rows = [
    { doc: 'CC 1.234.567', name: 'A. Ramírez', tag: 'OK' },
    { doc: 'CC 9.876.543', name: 'M. Pérez', tag: 'OK' },
    { doc: 'CC 5.555.111', name: 'J. Torres', tag: 'OK' },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center justify-between text-[9px] font-medium uppercase tracking-wider text-slate-400">
        <span>Cotizantes cargados</span>
        <span className="font-mono text-[10px] text-emerald-600">✓ {rows.length}/3</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li
            key={r.doc}
            className="flex animate-fade-in items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-[10px] shadow-sm"
            style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'both' }}
          >
            <span className="font-mono text-slate-400">{r.doc}</span>
            <span className="font-medium text-slate-700">{r.name}</span>
            <span className="ml-auto rounded-full bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {r.tag}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Mini-mockup paso 2 — progress bar de generación con porcentaje
 * "vivo" (animación CSS keyframe con width). Da sensación de
 * proceso en curso.
 */
function MockProgresoGenerar() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-1.5 flex items-center justify-between text-[9px] font-medium uppercase tracking-wider text-slate-400">
        <span>Generando planillas</span>
        <span className="font-mono text-[10px] text-brand-blue">78%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-gradient-h" style={{ width: '78%' }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
        <MockMini label="Tipo E" value="42" tone="blue" />
        <MockMini label="Tipo I" value="18" tone="turquoise" />
        <MockMini label="ARL" value="60" tone="green" />
      </div>
    </div>
  );
}

function MockMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'turquoise' | 'green';
}) {
  const cls = {
    blue: 'bg-brand-blue/5 text-brand-blue-dark',
    turquoise: 'bg-brand-turquoise/10 text-brand-blue-dark',
    green: 'bg-brand-green/5 text-brand-green-dark',
  }[tone];
  return (
    <div className={`rounded-md px-2 py-1.5 ${cls}`}>
      <p className="text-[8px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-bold">{value}</p>
    </div>
  );
}

/**
 * Mini-mockup paso 3 — confirmación de pago con check verde y datos
 * de la transacción. Cierre del flujo.
 */
function MockPagoConfirmado() {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-emerald-800">Pago confirmado</p>
          <p className="font-mono text-[9px] text-emerald-700">PLA-001284 · vía PSE</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-md bg-white px-2.5 py-1.5">
        <span className="text-[9px] font-medium text-slate-500">Total pagado</span>
        <span className="font-mono text-[11px] font-bold text-slate-900">$ 1.245.300</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NÚMEROS
// ─────────────────────────────────────────────────────────────
function Numeros() {
  const stats = [
    { value: '+20.000', label: 'Cotizantes activos en la plataforma' },
    { value: '+150', label: 'Empresas del sector confían en nosotros' },
    { value: '+1.500', label: 'Afiliaciones mensuales automatizadas' },
    { value: '100%', label: 'Conformidad con la Resolución 2388/2016' },
  ];
  return (
    // Banda compacta: el título queda a la izquierda y los 4 stats a la
    // derecha en una sola fila visual (lg+), reduciendo la altura de la
    // sección oscura y eliminando el "espacio vacío" entre Cómo Funciona
    // y FAQ. En mobile el grid de stats baja debajo del título.
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue-dark to-brand-blue-dark px-6 py-12 lg:px-12 lg:py-14">
      {/* Blob decorativo turquoise — `pointer-events-none` para no bloquear
          interacción y sin z-index negativo (que se salía del stacking
          context de la sección y dejaba el fondo blanco). */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-brand-turquoise/20 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            En números
          </span>
          <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            La operación que respalda tu día a día.
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:col-span-8 lg:grid-cols-4 lg:gap-6">
          {stats.map((s) => (
            <div key={s.label} className="border-l-2 border-white/20 pl-3 lg:pl-4">
              <p className="font-heading text-3xl font-bold leading-none tracking-tight text-white sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1.5 text-xs leading-snug text-white/70 sm:text-sm">{s.label}</p>
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
      a: 'Somos una plataforma SaaS para empresas del sector de la seguridad social y para independientes. Calculamos, validamos y pagamos los aportes a EPS, AFP, ARL y CCF a través de un operador autorizado por el Ministerio de Salud; automatizamos la afiliación de cotizantes a ARL y centralizamos cartera, gestiones e incapacidades en un solo panel.',
    },
    {
      q: '¿Necesito tener mi propio operador PILA para usar la plataforma?',
      a: 'No. Operamos como aliados de un operador autorizado, así que no necesitas resolución propia ni convenio directo con el operador. Te conectas a la plataforma, cargas tu base de cotizantes, y el sistema gestiona el flujo PILA por ti.',
    },
    {
      q: '¿Trabajan con todas las EPS, AFP, ARL y cajas de compensación?',
      a: 'Sí. PILA es un estándar nacional regulado por la Resolución 2388 de 2016, así que la generación, validación y pago de planillas aplica para todas las EPS, AFP, ARL y CCF activas en Colombia. La afiliación automatizada de cotizantes está disponible actualmente para una ARL principal; ampliar a más ARL está en nuestro roadmap.',
    },
    {
      q: '¿Cómo se factura el servicio?',
      a: 'Trabajamos con dos modelos: para empresas del sector, tarifa mensual por cotizante activo o por sucursal según el volumen y los módulos contratados; para independientes, una comisión transparente sobre el aporte mensual. Sin cargos ocultos, sin contratos de permanencia.',
    },
    {
      q: '¿Cuánto demora la implementación?',
      a: 'Para independientes son minutos: registras tu documento, validamos contra BDUA/RUAF y empiezas a cotizar en el siguiente período. Para empresas del sector con base ya consolidada en Excel, el onboarding típico está entre 48 y 72 horas con acompañamiento. Migraciones de bases más grandes (varios miles de cotizantes) las coordinamos por sprints con tu equipo operativo.',
    },
    {
      q: '¿Mi información es segura?',
      a: 'Sí. La plataforma corre sobre infraestructura cifrada en tránsito y en reposo. Las credenciales de portales externos se guardan con AES-256-GCM y todas las acciones del sistema quedan registradas en bitácora con trazabilidad por usuario y por sucursal. Cumplimos con la Ley 1581 de 2012 (Habeas Data) y los lineamientos de la Resolución 2388 de 2016.',
    },
    {
      q: '¿Tienen soporte jurídico cuando una incapacidad o trámite se complica?',
      a: 'Sí. Cuando un caso escala (cuestionamiento de la EPS, derecho de petición, tutela, desacato), pasa automáticamente a nuestro flujo jurídico interno con bitácora completa, gestión documental confidencial por tipo (derecho de petición, tutela, desacato, resolución, otros) y permisos granulares solo para el área legal.',
    },
  ];

  return (
    <section id="faq" className="px-6 py-16 lg:px-12 lg:py-20">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Preguntas frecuentes"
          title="Respuestas claras."
          description="Si tu pregunta no está acá, escríbenos por WhatsApp — respondemos en menos de un día hábil."
          centered
        />
        <div className="mt-6 flex justify-center">
          <a
            href={waUrl(WA_MENSAJES.preguntaFaq)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white shadow-md transition hover:bg-[#1ebe5d] hover:shadow-lg"
          >
            <MessageCircle className="h-4 w-4" />
            Hacer mi pregunta por WhatsApp
          </a>
        </div>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
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
      className="border-t border-slate-100 bg-slate-50/60 px-6 py-16 lg:px-12 lg:py-20"
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
          <div className="relative grid gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Texto + datos */}
            <div className="lg:col-span-5">
              <h2 className="font-heading text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                ¿Listo para que operemos tu seguridad social?
              </h2>
              <p className="mt-5 text-base text-white/85 sm:text-lg">
                Déjanos tus datos y un asesor te contacta en menos de un día hábil. O hablemos
                directamente por WhatsApp si prefieres.
              </p>

              <div className="mt-8">
                <a
                  href={waUrl(WA_MENSAJES.contactoComercial)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  Contactar por WhatsApp
                </a>
              </div>

              <div className="mt-10 grid gap-3 border-t border-white/20 pt-8 text-sm text-white/85">
                <ContactoItem icon={Mail} label="gerencia.gnt@gmail.com" />
                <ContactoItem icon={Phone} label="+57 (1) 000 0000" />
                <ContactoItem icon={MapPin} label="Pereira, Colombia" />
              </div>
            </div>

            {/* Form de demo */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-white/20 bg-white/5 p-6 backdrop-blur sm:p-8">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                  Solicitar demo
                </p>
                <h3 className="mt-1 font-heading text-xl font-bold text-white sm:text-2xl">
                  Cuéntanos sobre tu operación.
                </h3>
                <div className="mt-5">
                  <SolicitarDemoForm />
                </div>
              </div>
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
            <Link href="/landing" className="flex items-center" aria-label="Sistema PILA">
              <Image
                src="/logo-horizontal.svg"
                alt="Sistema PILA"
                width={184}
                height={43}
                className="h-10 w-auto"
              />
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
          <p>
            © {year} Sistema PILA · Grupo de Negocios Temporales SAS. Todos los derechos reservados.
          </p>
          <p>Pereira · Colombia</p>
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
