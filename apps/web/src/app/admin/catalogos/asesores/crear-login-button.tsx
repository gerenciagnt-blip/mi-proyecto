'use client';

import { useState, useTransition } from 'react';
import { Copy, KeyRound, Check, X } from 'lucide-react';
import { createAsesorLoginAction, type CreateLoginActionState } from './actions';

/**
 * Sprint Asesor Comercial — botón en la tabla de asesores que dispara la
 * creación de un User con role=ASESOR_COMERCIAL amarrado al catálogo.
 *
 * Al crearse muestra el password temporal en un modal pequeño con botón
 * "copiar". El password es vista única — esta es la única ventana donde
 * el staff puede capturarlo.
 *
 * Si la acción falla muestra el error inline; nunca cierra el modal sin
 * confirmar lectura del password.
 */
export function CrearLoginButton({ asesorId }: { asesorId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CreateLoginActionState>({});
  const [pending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);

  function abrir() {
    setOpen(true);
    setState({});
    setCopiado(false);
  }

  function cerrar() {
    setOpen(false);
    setState({});
    setCopiado(false);
  }

  function crear() {
    startTransition(async () => {
      const result = await createAsesorLoginAction(asesorId);
      setState(result);
    });
  }

  function copiar() {
    if (!state.tempPassword) return;
    void navigator.clipboard.writeText(state.tempPassword).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Crear login para que el asesor entre al sistema"
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-brand-blue"
      >
        <KeyRound className="h-3 w-3" />
        Crear login
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={cerrar}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between">
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-900">
                  Crear login del asesor
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Se creará un usuario con rol Asesor Comercial usando el correo del catálogo. El
                  password se muestra una sola vez — cópialo antes de cerrar.
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {!state.tempPassword && !state.error && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cerrar}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={crear}
                  className="rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark disabled:opacity-60"
                  disabled={pending}
                >
                  {pending ? 'Creando…' : 'Crear login'}
                </button>
              </div>
            )}

            {state.error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {state.error}
              </div>
            )}

            {state.tempPassword && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Login creado para <strong>{state.email}</strong>. Comparte el password con el
                  asesor por un canal seguro — no podrás verlo de nuevo.
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Password temporal
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                      {state.tempPassword}
                    </code>
                    <button
                      type="button"
                      onClick={copiar}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copiado ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={cerrar}
                    className="rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark"
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
