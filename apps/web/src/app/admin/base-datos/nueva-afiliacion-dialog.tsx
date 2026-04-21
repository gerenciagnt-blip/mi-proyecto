'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  NuevaAfiliacionForm,
  type NuevaAfiliacionFormProps,
} from './nueva-afiliacion-form';

export function NuevaAfiliacionDialog(props: Omit<NuevaAfiliacionFormProps, 'onSuccess'>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Nueva afiliación</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva afiliación"
        description="Crea el cotizante (si ya existe se actualiza) y su afiliación a una empresa."
        size="xl"
      >
        <NuevaAfiliacionForm {...props} onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
