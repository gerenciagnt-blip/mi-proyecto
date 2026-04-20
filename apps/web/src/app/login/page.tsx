import { LoginForm } from './login-form';

export const metadata = {
  title: 'Ingresar — Sistema PILA',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sistema PILA</h1>
          <p className="mt-1 text-sm text-slate-500">Ingresa con tus credenciales</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
