'use client';

import { useActionState, useRef, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { PasswordInput } from '@/components/ui/password-input';
import { resetPasswordAction, type ActionState } from '../actions';

function generarPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+?';
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]!;
  const parts = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = parts.length; i < 12; i++) parts.push(pick(all));
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j]!, parts[i]!];
  }
  return parts.join('');
}

export function PasswordForm({ userId }: { userId: string }) {
  const bound = resetPasswordAction.bind(null, userId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const ref = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setPassword('');
      setPasswordConfirm('');
    }
  }, [state.ok]);

  const passwordsMatch =
    password.length === 0 || passwordConfirm.length === 0 || password === passwordConfirm;
  const canSubmit =
    password.length >= 8 && password === passwordConfirm && !pending;

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="reset-password">
            Nueva contraseña <span className="text-red-500">*</span>
          </Label>
          <div className="mt-1 flex gap-2">
            <PasswordInput
              id="reset-password"
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
          <Label htmlFor="reset-password-confirm">
            Confirmar contraseña <span className="text-red-500">*</span>
          </Label>
          <PasswordInput
            id="reset-password-confirm"
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
          <span>Contraseña actualizada correctamente</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={!canSubmit}>
          {pending ? 'Actualizando…' : 'Restablecer contraseña'}
        </Button>
      </div>
    </form>
  );
}
