import { PilaLogo } from '@/components/brand/pila-logo';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Ingresar — Sistema PILA',
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Fondo con gradiente sutil de marca */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(30,136,229,0.08),_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_rgba(67,160,71,0.06),_transparent_55%)]"
      />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8">
          <PilaLogo size="lg" priority />
        </div>

        {/* Card de login */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-brand">
          <header className="mb-6">
            <h2 className="font-heading text-xl font-semibold text-slate-900">Ingresar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Usa tus credenciales para acceder al sistema.
            </p>
          </header>

          <LoginForm />
        </div>

        {/* Pie discreto */}
        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Sistema PILA · Todos los derechos reservados
        </p>
      </div>
    </main>
  );
}
