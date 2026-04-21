import { requireAdmin } from '@/lib/auth-helpers';
import { PilaLogo } from '@/components/brand/pila-logo';
import { AdminNav } from '@/components/admin/admin-nav';
import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/app/dashboard/logout-button';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-center border-b border-slate-100 px-4">
          <PilaLogo size="sm" />
        </div>
        <AdminNav />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Panel de administración
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-slate-900">{session.user.name}</p>
              <p className="text-[11px] text-slate-500">
                {ROLE_LABELS[session.user.role] ?? session.user.role}
              </p>
            </div>
            <Avatar name={session.user.name} />
            <LogoutButton compact />
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
