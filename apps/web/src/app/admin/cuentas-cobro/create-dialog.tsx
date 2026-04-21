'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CreateCuentaCobroForm } from './create-form';

type Sucursal = { id: string; codigo: string; nombre: string };

export function CreateCuentaCobroDialog({ sucursales }: { sucursales: Sucursal[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Nueva empresa CC</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva empresa CC"
        description="Agrupador de cotizantes para facturación dentro de una sucursal."
        size="xl"
      >
        <CreateCuentaCobroForm sucursales={sucursales} onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
