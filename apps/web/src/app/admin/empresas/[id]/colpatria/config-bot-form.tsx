'use client';

import { useActionState } from 'react';
import { AlertCircle, CheckCircle2, Cog, ListTree } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  actualizarConfigColpatriaAction,
  type ActionState,
  type ColpatriaConfigEstado,
} from './actions';

/**
 * Form para los selectores AXA del paso /Bienvenida + los defaults del
 * formulario de Ingreso Individual. No mezcla credenciales (ese es
 * `ColpatriaForm`).
 *
 * Estos valores son técnicos del portal AXA — el ADMIN los obtiene
 * inspeccionando el HTML del portal o pidiéndolos al gestor de la cuenta.
 * Por eso son inputs de texto libre (no podemos validar contra el portal
 * desde el server sin loguearnos).
 */
export function ConfigBotForm({
  empresaId,
  estadoInicial,
}: {
  empresaId: string;
  estadoInicial: ColpatriaConfigEstado;
}) {
  const bound = actualizarConfigColpatriaAction.bind(null, empresaId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <header>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Cog className="h-4 w-4 text-brand-blue" />
          Configuración del bot
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Selectores que el bot usa al loguearse en AXA, y valores default que rellena en el
          formulario de Ingreso Individual. Cambiar estos valores invalida la sesión cacheada.
        </p>
      </header>

      {/* Selectores /Bienvenida */}
      <fieldset className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Selectores AXA (paso post-login)
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="colp-aplicacion">Aplicación</Label>
            <Input
              id="colp-aplicacion"
              name="aplicacion"
              defaultValue={estadoInicial.aplicacion}
              placeholder="ARP"
            />
            <p className="text-[10px] text-slate-500">Casi siempre ARP (Portal ARL)</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-perfil">Perfil</Label>
            <select
              id="colp-perfil"
              name="perfil"
              defaultValue={estadoInicial.perfil}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="OFI">OFI — Oficial</option>
              <option value="OPE">OPE — Operador</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-eid">ID interno empresa AXA</Label>
            <Input
              id="colp-eid"
              name="empresaIdInterno"
              defaultValue={estadoInicial.empresaIdInterno ?? ''}
              placeholder="105787"
            />
            <p className="text-[10px] text-slate-500">
              Option value de #ddlEmpresas (≠ NIT, son ~6 dígitos)
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-aid">N° afiliación AXA</Label>
            <Input
              id="colp-aid"
              name="afiliacionId"
              defaultValue={estadoInicial.afiliacionId ?? ''}
              placeholder="9048054"
            />
            <p className="text-[10px] text-slate-500">Option value de #ddlAfiliaciones</p>
          </div>
        </div>
      </fieldset>

      {/* Defaults del form */}
      <fieldset className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
        <legend className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <ListTree className="h-3 w-3" />
          Defaults del form Ingreso Individual
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="colp-suc">Sucursal default</Label>
            <Input
              id="colp-suc"
              name="codigoSucursalDefault"
              defaultValue={estadoInicial.codigoSucursalDefault ?? ''}
              placeholder="01"
            />
            <p className="text-[10px] text-slate-500">
              Fallback si un nivel no tiene centro de trabajo asignado
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-tipoaf">Tipo de afiliación</Label>
            <Input
              id="colp-tipoaf"
              name="tipoAfiliacionDefault"
              defaultValue={estadoInicial.tipoAfiliacionDefault ?? ''}
              placeholder="1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-grupo">Grupo de ocupación</Label>
            <Input
              id="colp-grupo"
              name="grupoOcupacionDefault"
              defaultValue={estadoInicial.grupoOcupacionDefault ?? ''}
              placeholder="GRP1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="colp-tipoocup">Tipo de ocupación</Label>
            <Input
              id="colp-tipoocup"
              name="tipoOcupacionDefault"
              defaultValue={estadoInicial.tipoOcupacionDefault ?? ''}
              placeholder="TPO1"
            />
            <p className="text-[10px] text-slate-500">Depende de grupo de ocupación</p>
          </div>
        </div>
        <p className="mt-3 rounded-md bg-slate-100 px-2 py-1.5 text-[10px] text-slate-600">
          <strong>Quemados en el bot:</strong> TipoSalario={'"1"'} (Básico), ModalidadTrabajo=
          {'"01"'} (Presencial), TareaAltoRiesgo={'"0000001"'} (No aplica).
        </p>
      </fieldset>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Configuración guardada. La sesión cacheada se invalidó.</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar configuración'}
        </Button>
      </div>
    </form>
  );
}
