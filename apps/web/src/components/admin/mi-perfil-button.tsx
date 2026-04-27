'use client';

/**
 * Sprint Soporte reorg fase 2 — Botón "Mi perfil" en la barra superior
 * que abre un modal con dos secciones:
 *   1. Datos del usuario (sesión actual, read-only).
 *   2. Cambiar contraseña: actual + nueva + confirmación.
 *
 * Reemplaza al link `/admin/perfil` que llevaba a una página dedicada.
 * Disponible para todos los roles (ADMIN, SOPORTE, ALIADO_OWNER,
 * ALIADO_USER) — la action valida la sesión.
 */

import { useActionState, useEffect, useState } from 'react';
import {
  Mail,
  Shield,
  Building,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  User as UserIcon,
} from 'lucide-react';
import type { Role } from '@pila/db';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { cambiarPasswordAction, type CambiarPasswordState } from '@/app/admin/perfil/actions';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SOPORTE: 'Soporte',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

export function MiPerfilButton({
  userName,
  userRole,
  userEmail,
  userSucursalCodigo,
}: {
  userName: string;
  userRole: Role;
  userEmail: string;
  userSucursalCodigo: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Mi perfil"
        className="flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-slate-50"
      >
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium text-slate-900">{userName}</p>
          <p className="text-[11px] text-slate-500">{ROLE_LABELS[userRole] ?? userRole}</p>
        </div>
        <Avatar name={userName} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Mi perfil"
        description="Información de tu sesión y cambio de contraseña."
        size="md"
      >
        <div className="space-y-5">
          {/* Identidad */}
          <section className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <Avatar name={userName} size="lg" />
            <div>
              <p className="font-heading text-lg font-semibold text-slate-900">{userName}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[userRole] ?? userRole}</p>
            </div>
          </section>

          {/* Detalle */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <UserIcon className="h-3 w-3" />
              Datos
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <DetalleRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Correo"
                value={userEmail}
              />
              <DetalleRow
                icon={<Shield className="h-3.5 w-3.5" />}
                label="Rol"
                value={ROLE_LABELS[userRole] ?? userRole}
              />
              <DetalleRow
                icon={<Building className="h-3.5 w-3.5" />}
                label="Sucursal"
                value={userSucursalCodigo ?? '— (acceso global)'}
              />
            </dl>
          </section>

          {/* Cambiar contraseña */}
          <CambiarPasswordSection />
        </div>
      </Dialog>
    </>
  );
}

function DetalleRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="mt-0.5 truncate text-xs font-medium text-slate-900">{value}</dd>
      </div>
    </div>
  );
}

function CambiarPasswordSection() {
  const [state, submit, pending] = useActionState<CambiarPasswordState, FormData>(
    cambiarPasswordAction,
    {},
  );
  // Después de un OK, limpiamos los campos a través de un key remontable.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => setFormKey((k) => k + 1), 1500);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <KeyRound className="h-3 w-3" />
        Cambiar contraseña
      </h2>
      <form key={formKey} action={submit} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="actual" className="text-xs">
            Contraseña actual <span className="text-red-500">*</span>
          </Label>
          <Input
            id="actual"
            name="actual"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="nueva" className="text-xs">
              Nueva contraseña <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nueva"
              name="nueva"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">Mínimo 8 caracteres.</p>
          </div>
          <div>
            <Label htmlFor="confirmacion" className="text-xs">
              Confirmar nueva <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirmacion"
              name="confirmacion"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1"
            />
          </div>
        </div>

        {state.error && (
          <Alert variant="danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </Alert>
        )}
        {state.ok && (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Contraseña actualizada.</span>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <KeyRound className="h-3.5 w-3.5" />
                Cambiar contraseña
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
