import { Clock, ShieldCheck } from 'lucide-react';
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
      className="relative flex min-h-[100dvh] min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12"
      style={{
        background:
          'radial-gradient(circle at 20% 30%, rgba(47,128,237,0.15), transparent 40%), radial-gradient(circle at 80% 70%, rgba(39,174,96,0.15), transparent 40%), linear-gradient(180deg, #F4F7FB 0%, #EAF1F9 100%)',
      }}
    >
      {/* Blobs decorativos sutiles (se ocultan en <sm para no saturar) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 hidden h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-1/4 hidden h-80 w-80 rounded-full bg-brand-green/10 blur-3xl sm:block"
      />

      <div className="relative w-full max-w-[440px] animate-fade-in">
        {/* Logo — usa max-w-full para shrink automático si falta espacio */}
        <div
          className="mb-6 flex justify-center sm:mb-8 lg:mb-10"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.08))' }}
        >
          <PilaLogo size="lg" />
        </div>

        {/* Card glass — padding y corners escalados */}
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

        {/* Badge de confianza + footer */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-brand-text-muted sm:mt-6">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Acceso seguro y cifrado</span>
        </div>
        <p className="mt-2 px-4 text-center text-xs text-brand-text-muted">
          © {new Date().getFullYear()} Sistema PILA · Todos los derechos reservados
        </p>
      </div>
    </main>
  );
}
