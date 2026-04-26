'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Item de la lista que se comporta como botón: marca como leída en
 * background y navega al `href`. Render-as-children para que el padre
 * controle el contenido visual completo.
 */
export function MarcarLeidaItem({
  id,
  href,
  leida,
  children,
}: {
  id: string;
  href: string | null;
  leida: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function handleClick() {
    // Marca leída en background (no esperamos)
    if (!leida) {
      void fetch(`/api/notificaciones/${id}/leer`, { method: 'POST' });
    }
    if (href) {
      router.push(href);
    } else {
      // Sin href: solo refresh para que se vea "leída".
      router.refresh();
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'block w-full text-left transition hover:bg-slate-50',
          !leida && 'bg-brand-blue/5',
        )}
      >
        {children}
      </button>
    </li>
  );
}

/**
 * Botón "Marcar todas como leídas". Llama al endpoint y refresca la
 * página completa para que se vean los cambios.
 */
export function MarcarTodasButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await fetch('/api/notificaciones/leer-todas', { method: 'POST' });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-blue bg-white px-3 text-xs font-medium text-brand-blue shadow-sm transition hover:bg-brand-blue/5 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCheck className="h-3.5 w-3.5" />
      )}
      {pending ? 'Marcando…' : 'Marcar todas como leídas'}
    </button>
  );
}
