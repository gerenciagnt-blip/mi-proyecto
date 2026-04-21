'use client';

import * as React from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input, type InputProps } from './input';

/**
 * Input de contraseña con toggle show/hide.
 * Icono Lock a la izquierda y botón ojo a la derecha.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type' | 'icon' | 'trailing'>
>((props, ref) => {
  const [show, setShow] = React.useState(false);

  return (
    <Input
      ref={ref}
      type={show ? 'text' : 'password'}
      icon={Lock}
      trailing={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="text-brand-text-muted transition-colors hover:text-brand-text-primary"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
      {...props}
    />
  );
});
PasswordInput.displayName = 'PasswordInput';
