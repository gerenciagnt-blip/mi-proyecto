'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { configurarColpatriaAction, type ActionState, type ColpatriaConfigEstado } from './actions';

/**
 * Formulario para configurar las credenciales de Colpatria ARL para
 * una empresa planilla. Tres flujos en una sola pantalla:
 *
 *   1. **Sin credenciales** → input usuario + password obligatorios
 *      para guardar.
 *
 *   2. **Credenciales configuradas + activo** → muestra "Configurado",
 *      campo password OPCIONAL (vacío = no cambiar). Toggle activo/inactivo.
 *
 *   3. **Limpiar todo** → botón aparte que pide confirmación.
 *
 * Por seguridad, NUNCA se envía al cliente el password descifrado —
 * solo el flag `passwordOk`.
 */
export function ColpatriaForm({
  empresaId,
  empresaNombre,
  estadoInicial,
}: {
  empresaId: string;
  empresaNombre: string;
  estadoInicial: ColpatriaConfigEstado;
}) {
  const bound = configurarColpatriaAction.bind(null, empresaId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  // Estado controlado del toggle activo. Como el server lo persiste
  // tras OK, lo inicializamos con lo que vino del server pero seguimos
  // el cambio del usuario localmente.
  const [activo, setActivo] = useState(estadoInicial.activo);
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);

  const tieneCredenciales = estadoInicial.passwordOk && estadoInicial.usuario;

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <KeyRound className="h-4 w-4 text-brand-blue" />
          Credenciales del portal Colpatria ARL
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          El bot usa estas credenciales para iniciar sesión en el portal de Colpatria y procesar las
          afiliaciones nuevas o reactivaciones de <strong>{empresaNombre}</strong> automáticamente.
          El password se guarda encriptado y nunca se vuelve a mostrar.
        </p>
      </header>

      {/* Estado actual */}
      <section
        className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
          tieneCredenciales ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        {tieneCredenciales ? (
          <>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">Credenciales configuradas</p>
              <p className="mt-0.5 text-emerald-800">
                Usuario: <span className="font-mono">{estadoInicial.usuario}</span>
                {estadoInicial.passwordSetAt && (
                  <span className="ml-2 text-emerald-700/70">
                    · password actualizado{' '}
                    {new Date(estadoInicial.passwordSetAt).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Sin credenciales</p>
              <p className="mt-0.5 text-amber-800">
                Configura usuario y password para que el bot pueda procesar las afiliaciones de esta
                empresa.
              </p>
            </div>
          </>
        )}
      </section>

      <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="colp-usuario">Usuario del portal</Label>
            <Input
              id="colp-usuario"
              name="usuario"
              defaultValue={estadoInicial.usuario ?? ''}
              placeholder="usuario.colpatria"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="colp-password">
              Password
              {tieneCredenciales && (
                <span className="ml-2 font-normal text-slate-400">(vacío = no cambiar)</span>
              )}
            </Label>
            <PasswordInput
              id="colp-password"
              name="password"
              placeholder={tieneCredenciales ? '••••••••' : 'password Colpatria'}
              autoComplete="new-password"
            />
          </div>
        </div>

        {/* Toggle activo */}
        <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <input
            type="checkbox"
            name="activo"
            checked={activo}
            onChange={(e) => setActivo(e.currentTarget.checked)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <p className="flex items-center gap-1.5 font-medium text-slate-900">
              {activo ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Bot activo
                </>
              ) : (
                <>
                  <ShieldOff className="h-3.5 w-3.5 text-slate-400" />
                  Bot inactivo
                </>
              )}
            </p>
            <p className="mt-0.5 text-slate-600">
              {activo
                ? 'Al guardar afiliaciones nuevas o reactivaciones, se creará un job pendiente de procesar en Colpatria.'
                : 'Las afiliaciones de esta empresa NO disparan el bot. Útil para pausar mientras revisas el flujo.'}
            </p>
          </div>
        </label>

        {state.error && (
          <Alert variant="danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </Alert>
        )}
        {state.ok && (
          <Alert variant="success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Configuración guardada correctamente.</span>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </form>

      {/* Zona peligrosa: limpiar credenciales */}
      {tieneCredenciales && (
        <details className="rounded-lg border border-rose-200 bg-rose-50/30">
          <summary className="cursor-pointer p-3 text-xs font-medium text-rose-900 hover:bg-rose-100/40">
            Zona peligrosa
          </summary>
          <div className="border-t border-rose-200 p-3 text-xs">
            <p className="text-rose-800">
              Borra las credenciales y desactiva el bot. La sesión cacheada también se invalida. No
              afecta los jobs ya creados — solo las afiliaciones futuras.
            </p>
            {!confirmarLimpiar ? (
              <button
                type="button"
                onClick={() => setConfirmarLimpiar(true)}
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3 w-3" />
                Limpiar credenciales
              </button>
            ) : (
              <form action={action} className="mt-3 flex items-center gap-2">
                {/* Form vacío + activo=false → action interpreta como "limpiar" */}
                <input type="hidden" name="usuario" value="" />
                <input type="hidden" name="password" value="" />
                <span className="text-rose-900">¿Confirmas?</span>
                <Button type="submit" variant="danger" size="sm" disabled={pending}>
                  Sí, limpiar
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmarLimpiar(false)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </form>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
