'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AfiliacionForm, type AfiliacionFormProps, type Modalidad } from './afiliacion-form';
import { SoporteAfSection } from './soporte-af-section';

type CreateTriggerProps = Omit<AfiliacionFormProps, 'mode' | 'onSuccess'> & {
  modalidad: Modalidad;
  triggerLabel?: string;
  variant?: 'gradient' | 'secondary';
};

/**
 * Botón + modal para crear una nueva afiliación con modalidad preseleccionada.
 */
export function NuevaAfiliacionButton(props: CreateTriggerProps) {
  const [open, setOpen] = useState(false);
  const { triggerLabel, variant = 'gradient', ...formProps } = props;
  const label =
    triggerLabel ??
    `Nueva afiliación ${props.modalidad === 'DEPENDIENTE' ? 'dependiente' : 'independiente'}`;

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        <span>{label}</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Crea el cotizante (si ya existe se actualiza) y su afiliación a una empresa."
        size="xl"
      >
        <AfiliacionForm {...formProps} mode="create" onSuccess={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

type ControlledProps = Omit<AfiliacionFormProps, 'onSuccess'> & {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal controlado (edit / view) — el padre controla open/close.
 */
export function AfiliacionDialog(props: ControlledProps) {
  const { open, onClose, ...formProps } = props;

  const title =
    props.mode === 'view'
      ? 'Consultar afiliación'
      : props.mode === 'edit'
        ? 'Editar afiliación'
        : 'Nueva afiliación';

  const description =
    props.mode === 'view'
      ? 'Información de la afiliación (solo lectura).'
      : props.mode === 'edit'
        ? 'Modifica los campos de la afiliación.'
        : '';

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="xl">
      <AfiliacionForm {...formProps} onSuccess={onClose} />
      {props.mode === 'view' && props.afiliacionId && (
        <div className="mt-4">
          <SoporteAfSection afiliacionId={props.afiliacionId} />
        </div>
      )}
    </Dialog>
  );
}
