'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

/**
 * Filtro por número de documento del cotizante. Submit on Enter o blur.
 * Botón X limpia y refresca. Mantiene los demás filtros (status,
 * empresaId) intactos en el query string.
 */
export function DocumentoFilter({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(defaultValue);

  const aplicar = (nuevo: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    const limpio = nuevo.trim();
    if (limpio) {
      params.set('documento', limpio);
    } else {
      params.delete('documento');
    }
    params.delete('page'); // resetear paginación
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            aplicar(valor);
          }
        }}
        onBlur={() => {
          if (valor.trim() !== defaultValue) {
            aplicar(valor);
          }
        }}
        placeholder="Buscar por documento…"
        maxLength={20}
        className="h-8 w-44 rounded-md border border-slate-300 bg-white pl-7 pr-7 text-xs focus:border-brand-blue focus:outline-none"
      />
      {valor && (
        <button
          type="button"
          onClick={() => {
            setValor('');
            aplicar('');
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Limpiar"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
