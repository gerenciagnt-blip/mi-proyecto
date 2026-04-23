'use client';

import { useActionState, useRef, useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { PasswordInput } from '@/components/ui/password-input';
import { createUserAction, type ActionState } from './actions';

type Sucursal = { id: string; codigo: string; nombre: string };

/** Genera una contraseña aleatoria con 12 caracteres:
 *   - mínimo 1 mayúscula, 1 minúscula, 1 dígito, 1 símbolo.
 *   - sin caracteres ambiguos (O/0, l/1, etc.).
 */
function generarPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+?';
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]!;
  const parts = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = parts.length; i < 12; i++) parts.push(pick(all));
  // shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j]!, parts[i]!];
  }
  return parts.join('');
}

export function CreateUserForm({
  sucursales,
  onSuccess,
}: {
  sucursales: Sucursal[];
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState('ALIADO_USER');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setRole('ALIADO_USER');
      setPassword('');
      setPasswordConfirm('');
      onSuccess?.();
    }
  }, [state.ok, onSuccess]);

  // Validación cliente: coincidencia de contraseñas
  const passwordsMatch =
    password.length === 0 || passwordConfirm.length === 0 || password === passwordConfirm;
  const canSubmit =
    password.length >= 8 && password === passwordConfirm && !pending;

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">
            Correo <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="usuario@empresa.com"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="name">
            Nombre <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Juan Pérez"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="password">
            Contraseña inicial <span className="text-red-500">*</span>
          </Label>
          <div className="mt-1 flex gap-2">
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="flex-1"
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const nueva = generarPassword();
                setPassword(nueva);
                setPasswordConfirm(nueva);
              }}
              title="Generar contraseña segura"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div>
          <Label htmlFor="passwordConfirm">
            Confirmar contraseña <span className="text-red-500">*</span>
          </Label>
          <PasswordInput
            id="passwordConfirm"
            required
            minLength={8}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="Repite la contraseña"
            className="mt-1"
            autoComplete="new-password"
          />
          {!passwordsMatch && (
            <p className="mt-1 text-[11px] text-red-600">
              Las contraseñas no coinciden
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="role">
            Rol <span className="text-red-500">*</span>
          </Label>
          <Select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1"
          >
            <option value="ADMIN">Administrador</option>
            <option value="ALIADO_OWNER">Dueño Aliado</option>
            <option value="ALIADO_USER">Usuario Aliado</option>
          </Select>
        </div>
        {role !== 'ADMIN' && (
          <div>
            <Label htmlFor="sucursalId">
              Sucursal <span className="text-red-500">*</span>
            </Label>
            <Select
              id="sucursalId"
              name="sucursalId"
              required
              defaultValue=""
              className="mt-1"
            >
              <option value="" disabled>
                — Seleccionar —
              </option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nombre}
                </option>
              ))}
            </Select>
            {sucursales.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                Aún no hay sucursales — crea una antes de registrar usuarios de aliado.
              </p>
            )}
          </div>
        )}
      </div>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Usuario creado correctamente</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Creando…' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  );
}
