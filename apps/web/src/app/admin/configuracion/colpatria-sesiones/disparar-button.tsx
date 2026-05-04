'use client';

/**
 * Botón "Disparar login/logout auto". Llama al endpoint correspondiente
 * y muestra feedback inmediato. Refresca la página automáticamente
 * después de éxito para ver el nuevo estado.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type ResultadoApi = {
  kind:
    | 'NADA_QUE_HACER'
    | 'LOCAL_SPAWNED'
    | 'GH_DISPATCHED'
    | 'CONFIG_FALTANTE'
    | 'GH_API_ERROR'
    | 'NETWORK_ERROR'
    | 'SPAWN_ERROR';
  message: string;
  empresas?: number;
  sesiones?: number;
};

export function DispararLoginButton() {
  return (
    <DispararButton
      endpoint="/api/colpatria/disparar-login"
      label="Disparar login auto"
      icon={LogIn}
      variant="primary"
    />
  );
}

export function DispararLogoutButton() {
  return (
    <DispararButton
      endpoint="/api/colpatria/disparar-logout"
      label="Disparar logout auto"
      icon={LogOut}
      variant="secondary"
    />
  );
}

function DispararButton({
  endpoint,
  label,
  icon: Icon,
  variant,
}: {
  endpoint: string;
  label: string;
  icon: typeof LogIn;
  variant: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [estado, setEstado] = useState<{ kind: 'idle' } | { kind: 'ok' | 'error'; texto: string }>({
    kind: 'idle',
  });

  const onClick = () => {
    setEstado({ kind: 'idle' });
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = (await res.json()) as ResultadoApi;
        const ok = res.status === 200 || res.status === 202;
        setEstado({ kind: ok ? 'ok' : 'error', texto: data.message });
        if (ok && data.kind !== 'NADA_QUE_HACER') {
          // Refresh con delay — el bot tarda 1-2 min en levantar la sesión.
          setTimeout(() => router.refresh(), 3000);
        }
        setTimeout(() => setEstado({ kind: 'idle' }), 10000);
      } catch (err) {
        setEstado({
          kind: 'error',
          texto: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  };

  const baseBtn =
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60';
  const styleBtn =
    variant === 'primary'
      ? 'bg-brand-blue text-white hover:bg-brand-blue-dark'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={`${baseBtn} ${styleBtn}`}
      >
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Disparando…
          </>
        ) : (
          <>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </>
        )}
      </button>
      {estado.kind === 'ok' && (
        <p className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {estado.texto}
        </p>
      )}
      {estado.kind === 'error' && (
        <p className="inline-flex items-center gap-1 text-[11px] text-rose-700">
          <AlertCircle className="h-3 w-3" />
          {estado.texto}
        </p>
      )}
    </div>
  );
}
