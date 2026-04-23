'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CreateUserForm, type RolCustomOpt } from './create-form';

type Sucursal = { id: string; codigo: string; nombre: string };

export function CreateUserDialog({
  sucursales,
  rolesCustom,
}: {
  sucursales: Sucursal[];
  rolesCustom: RolCustomOpt[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>Crear usuario</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Crear usuario"
        description="El usuario recibirá la contraseña inicial para iniciar sesión."
        size="md"
      >
        <CreateUserForm
          sucursales={sucursales}
          rolesCustom={rolesCustom}
          onSuccess={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
