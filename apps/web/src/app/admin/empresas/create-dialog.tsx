'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CreateEmpresaForm } from './create-form';
import type { DeptoOpt } from './empresa-fields';

type Arl = { id: string; codigo: string; nombre: string };

export function CreateEmpresaDialog({
  arls,
  departamentos,
}: {
  arls: Arl[];
  departamentos: DeptoOpt[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Nueva empresa planilla</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva empresa planilla"
        description="Identificación, representante legal, ubicación y parámetros PILA."
        size="xl"
      >
        <CreateEmpresaForm
          arls={arls}
          departamentos={departamentos}
          onSuccess={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
