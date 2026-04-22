'use client';

import { useActionState } from 'react';
import { updateEmpresaAction, type ActionState } from '../actions';
import { EmpresaFields, type DeptoOpt } from '../empresa-fields';

type Empresa = {
  id: string;
  nit: string;
  dv: string | null;
  nombre: string;
  nombreComercial: string | null;
  tipoPersona: string | null;
  repLegalTipoDoc: string | null;
  repLegalNumeroDoc: string | null;
  repLegalNombre: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  departamentoId: string | null;
  municipioId: string | null;
  telefono: string | null;
  email: string | null;
  ciiuPrincipal: string | null;
  arlId: string | null;
  exoneraLey1607: boolean;
  active: boolean;
};

type Arl = { id: string; codigo: string; nombre: string };

export function EditEmpresaForm({
  empresa,
  arls,
  departamentos,
}: {
  empresa: Empresa;
  arls: Arl[];
  departamentos: DeptoOpt[];
}) {
  const bound = updateEmpresaAction.bind(null, empresa.id);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  return (
    <form action={action} className="space-y-4">
      <EmpresaFields
        arls={arls}
        departamentos={departamentos}
        initial={{
          nit: empresa.nit,
          dv: empresa.dv ?? '',
          nombre: empresa.nombre,
          nombreComercial: empresa.nombreComercial ?? '',
          tipoPersona: empresa.tipoPersona ?? 'JURIDICA',
          repLegalTipoDoc: empresa.repLegalTipoDoc ?? 'CC',
          repLegalNumeroDoc: empresa.repLegalNumeroDoc ?? '',
          repLegalNombre: empresa.repLegalNombre ?? '',
          direccion: empresa.direccion ?? '',
          ciudad: empresa.ciudad ?? '',
          departamento: empresa.departamento ?? '',
          departamentoId: empresa.departamentoId ?? '',
          municipioId: empresa.municipioId ?? '',
          telefono: empresa.telefono ?? '',
          email: empresa.email ?? '',
          ciiuPrincipal: empresa.ciiuPrincipal ?? '',
          arlId: empresa.arlId ?? '',
          exoneraLey1607: empresa.exoneraLey1607,
        }}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={empresa.active} />
          <span>Activa</span>
        </label>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-blue px-6 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
