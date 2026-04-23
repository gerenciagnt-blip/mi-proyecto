import { Clock, ShieldCheck } from 'lucide-react';
import { PilaLogoInline } from '@/components/brand/pila-logo-inline';
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
      className="relative flex min-h-[100dvh] min-h-screen flex-col overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 20% 30%, rgba(47,128,237,0.15), transparent 40%), radial-gradient(circle at 80% 70%, rgba(39,174,96,0.15), transparent 40%), linear-gradient(180deg, #F4F7FB 0%, #EAF1F9 100%)',
      }}
    >
      {/* Blobs decorativos (solo ≥sm) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 hidden h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-1/4 hidden h-80 w-80 rounded-full bg-brand-green/10 blur-3xl sm:block"
      />

      {/* ===== Contenido principal (2 columnas en md+) ===== */}
      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8 px-5 py-8 sm:px-8 sm:py-10 md:flex-row md:gap-4 md:py-14 lg:gap-0 lg:py-16 xl:px-12">
        {/* --- Izquierda: logo con animación + tamaño responsive --- */}
        <section className="flex w-full flex-1 items-center justify-center md:pr-8 lg:pr-14 xl:pr-20">
          <PilaLogoInline
            animated
            imgClassName="w-56 sm:w-64 md:w-72 lg:w-[340px] xl:w-[420px] 2xl:w-[460px]"
          />
        </section>

        {/* --- Divisor vertical (solo ≥md) --- */}
        <div
          aria-hidden
          className="hidden h-80 w-px self-center bg-gradient-to-b from-transparent via-slate-300/60 to-transparent md:block lg:h-[26rem]"
        />

        {/* --- Derecha: card del formulario --- */}
        <section className="flex w-full flex-1 items-center justify-center md:pl-8 lg:pl-14 xl:pl-20">
          <div className="w-full max-w-[440px] animate-fade-in">
            <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-card-float backdrop-blur-md sm:rounded-3xl sm:p-8 lg:p-10">
              <header className="mb-6 sm:mb-7">
                <h2 className="font-heading text-[28px] font-semibold tracking-tight text-brand-text-primary sm:text-3xl">
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
          </div>
        </section>
      </div>

      {/* ===== Footer centrado ===== */}
      <footer className="relative flex flex-col items-center gap-1 pb-5 text-xs text-brand-text-muted sm:pb-7">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Acceso seguro y cifrado</span>
        </div>
        <p>
          © {new Date().getFullYear()} Sistema PILA · Todos los derechos
          reservados
        </p>
      </footer>
    </main>
  );
}
