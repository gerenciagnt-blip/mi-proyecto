'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { createEmpresaAction, type ActionState } from './actions';
import { EmpresaFields, type DeptoOpt } from './empresa-fields';

type Arl = { id: string; codigo: string; nombre: string };

export function CreateEmpresaForm({
  arls,
  departamentos,
  onSuccess,
}: {
  arls: Arl[];
  departamentos: DeptoOpt[];
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createEmpresaAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onSuccess?.();
    }
  }, [state.ok, onSuccess]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      <EmpresaFields arls={arls} departamentos={departamentos} />

      {state.error && <Alert variant="danger">{state.error}</Alert>}
      {state.ok && <Alert variant="success">Empresa creada</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear empresa'}
      </Button>
    </form>
  );
}
