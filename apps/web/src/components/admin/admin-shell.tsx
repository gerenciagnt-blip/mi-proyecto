'use client';

import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import type { Role } from '@pila/db';
import { PilaLogo } from '@/components/brand/pila-logo';
import { AdminNav } from '@/components/admin/admin-nav';
import { NotificacionesBell } from '@/components/admin/notificaciones-bell';
import { GlobalSearch } from '@/components/admin/global-search';
import { MiPerfilButton } from '@/components/admin/mi-perfil-button';
import { IdleLogout } from '@/components/auth/idle-logout';
import { LogoutButton } from '@/app/dashboard/logout-button';
import { ChatWidget } from '@/app/admin/chat/chat-widget';
import { PresenciaHeartbeat } from '@/app/admin/chat/presencia-heartbeat';
import { ChatEventsProvider } from '@/app/admin/chat/chat-events-provider';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'pila.sidebar.open';

export function AdminShell({
  userName,
  userRole,
  userEmail,
  userSucursalCodigo,
  modulosAccesibles,
  children,
}: {
  userName: string;
  userRole: Role;
  userEmail: string;
  userSucursalCodigo: string | null;
  /**
   * Set de módulos a los que el user tiene acceso (server-side via
   * `puedeAccederModulo`). El nav lo usa para ocultar items que el
   * RolCustom del user no permite.
   */
  modulosAccesibles?: string[];
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
      <IdleLogout />
      {/* Sprint Chat interno — heartbeat invisible + widget flotante.
          Solo se montan si el user tiene el módulo `chat` accesible
          (controlado por RolCustom). Heartbeat sin permiso de chat
          igual no tiene sentido. */}
      {modulosAccesibles?.includes('chat') && (
        <>
          <PresenciaHeartbeat />
          {/* Sprint Chat · SSE — conexión persistente que recibe push del
              server con eventos del chat. Mantiene el polling SWR como
              fallback con intervalos largos (ver conversaciones-sidebar
              y panel-conversacion). */}
          <ChatEventsProvider />
          <ChatWidget />
        </>
      )}
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
            <AdminNav role={userRole} modulosAccesibles={modulosAccesibles} />
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
              {open ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
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

          <div className="flex items-center gap-2">
            <GlobalSearch />
            <NotificacionesBell />
            {/* Sprint Soporte reorg fase 2 — antes era Link a /admin/perfil,
               ahora es modal con tabs (datos + cambio de contraseña). */}
            <MiPerfilButton
              userName={userName}
              userRole={userRole}
              userEmail={userEmail}
              userSucursalCodigo={userSucursalCodigo}
            />
            <LogoutButton compact />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
