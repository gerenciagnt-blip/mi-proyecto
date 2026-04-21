import { ShieldCheck } from 'lucide-react';
import { PilaLogo } from '@/components/brand/pila-logo';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Ingresar — Sistema PILA',
};

export default function LoginPage() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12"
      style={{
        background:
          'radial-gradient(circle at 20% 30%, rgba(47,128,237,0.15), transparent 40%), radial-gradient(circle at 80% 70%, rgba(39,174,96,0.15), transparent 40%), linear-gradient(180deg, #F4F7FB 0%, #EAF1F9 100%)',
      }}
    >
      {/* Blobs decorativos sutiles */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-1/4 h-80 w-80 rounded-full bg-brand-green/10 blur-3xl"
      />

      <div className="relative w-full max-w-[440px] animate-fade-in">
        {/* Logo */}
        <div
          className="mb-10 flex justify-center"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.08))' }}
        >
          <PilaLogo size="lg" />
        </div>

        {/* Card glass */}
        <div
          className="rounded-3xl border border-white/50 bg-white/85 p-10 shadow-card-float backdrop-blur-md"
        >
          <header className="mb-7">
            <h2 className="font-heading text-[26px] font-semibold tracking-tight text-brand-text-primary">
              Ingresar
            </h2>
            <p className="mt-1.5 text-sm text-brand-text-secondary">
              Usa tus credenciales para acceder al sistema.
            </p>
          </header>

          <LoginForm />
        </div>

        {/* Badge de confianza + footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-brand-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Acceso seguro y cifrado</span>
        </div>
        <p className="mt-2 text-center text-[11px] text-brand-text-muted">
          © {new Date().getFullYear()} Sistema PILA · Todos los derechos reservados
        </p>
      </div>
    </main>
  );
}
