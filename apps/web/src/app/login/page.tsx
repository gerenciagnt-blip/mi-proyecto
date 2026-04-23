import { Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { PilaLogo } from '@/components/brand/pila-logo';
import { Alert } from '@/components/ui/alert';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Ingresar — Sistema PILA',
};

type SP = { reason?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const mensajeInfo =
    sp.reason === 'idle'
      ? 'Cerramos tu sesión por inactividad. Ingresa nuevamente para continuar.'
      : null;

  return (
    <main
      className="relative min-h-[100dvh] min-h-screen overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 20% 30%, rgba(47,128,237,0.15), transparent 40%), radial-gradient(circle at 80% 70%, rgba(39,174,96,0.15), transparent 40%), linear-gradient(180deg, #F4F7FB 0%, #EAF1F9 100%)',
      }}
    >
      {/* Blobs decorativos (solo en ≥sm) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 hidden h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-1/4 hidden h-80 w-80 rounded-full bg-brand-green/10 blur-3xl sm:block"
      />

      {/* Grid de dos columnas en ≥lg; stack en mobile/tablet */}
      <div className="relative mx-auto flex min-h-[100dvh] min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:flex-row lg:gap-14 lg:px-10">
        {/* ===== Columna izquierda — branding ===== */}
        <section className="flex w-full max-w-xl flex-col items-center text-center lg:flex-1 lg:items-start lg:text-left">
          <div
            className="mb-5 lg:mb-8"
            style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.1))' }}
          >
            <PilaLogo size="lg" />
          </div>

          <h1 className="font-heading text-3xl font-bold tracking-tight text-brand-text-primary sm:text-4xl lg:text-[42px] lg:leading-[1.1]">
            Tu seguridad social,
            <br />
            <span className="bg-gradient-to-r from-brand-blue to-brand-green bg-clip-text text-transparent">
              a un click.
            </span>
          </h1>

          <p className="mt-4 max-w-lg text-sm text-brand-text-secondary sm:text-base">
            Plataforma unificada para afiliar cotizantes, liquidar aportes,
            generar planos PILA, gestionar cartera e incapacidades — todo en
            un mismo lugar.
          </p>

          {/* Highlights (solo ≥lg para no saturar mobile) */}
          <ul className="mt-7 hidden space-y-2.5 text-sm text-brand-text-secondary lg:block">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
              <span>Liquidación automática con tarifas y SMLV vigentes.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
              <span>Archivo plano según Resolución 2388/2016 listo para el operador.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
              <span>Bandeja de soporte: cartera, incapacidades y afiliaciones.</span>
            </li>
          </ul>
        </section>

        {/* ===== Columna derecha — formulario ===== */}
        <section className="flex w-full max-w-[440px] flex-col lg:flex-1 lg:max-w-[480px]">
          <div className="animate-fade-in">
            <div className="rounded-2xl border border-white/50 bg-white/85 p-6 shadow-card-float backdrop-blur-md sm:rounded-3xl sm:p-8 lg:p-10">
              <header className="mb-6 sm:mb-7">
                <h2 className="font-heading text-2xl font-semibold tracking-tight text-brand-text-primary sm:text-[26px]">
                  Ingresar
                </h2>
                <p className="mt-1.5 text-sm text-brand-text-secondary">
                  Usa tus credenciales para acceder al sistema.
                </p>
              </header>

              {mensajeInfo && (
                <Alert variant="warning" className="mb-5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{mensajeInfo}</span>
                </Alert>
              )}

              <LoginForm />
            </div>

            {/* Badge + footer */}
            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-brand-text-muted sm:mt-6">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Acceso seguro y cifrado</span>
            </div>
            <p className="mt-2 px-4 text-center text-xs text-brand-text-muted">
              © {new Date().getFullYear()} Sistema PILA · Todos los derechos
              reservados
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
