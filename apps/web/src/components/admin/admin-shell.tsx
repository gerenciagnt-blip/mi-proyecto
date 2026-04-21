'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import type { Role } from '@pila/db';
import { PilaLogo } from '@/components/brand/pila-logo';
import { AdminNav } from '@/components/admin/admin-nav';
import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/app/dashboard/logout-button';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

const STORAGE_KEY = 'pila.sidebar.open';

export function AdminShell({
  userName,
  userRole,
  children,
}: {
  userName: string;
  userRole: Role;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === '1');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  }, [open, mounted]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — colapsable via transición de width */}
      <aside
        aria-label="Menú principal"
        className={cn(
          'shrink-0 overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out',
          open ? 'w-64' : 'w-0 border-r-0',
        )}
      >
        <div className="flex h-full w-64 flex-col">
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-slate-100 px-4">
            <PilaLogo size="sm" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <AdminNav />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              title={open ? 'Ocultar menú' : 'Mostrar menú'}
              aria-label={open ? 'Ocultar menú' : 'Mostrar menú'}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {open ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </button>
            {/* Logo en el header cuando el sidebar está oculto */}
            {!open && (
              <div className="hidden sm:block">
                <PilaLogo size="sm" />
              </div>
            )}
            <p className="hidden text-xs font-medium uppercase tracking-wider text-slate-400 md:block">
              Panel de administración
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/perfil"
              title="Ver mi perfil"
              className="flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-slate-50"
            >
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium text-slate-900">{userName}</p>
                <p className="text-[11px] text-slate-500">
                  {ROLE_LABELS[userRole] ?? userRole}
                </p>
              </div>
              <Avatar name={userName} />
            </Link>
            <LogoutButton compact />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
