'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CheckCircle2, AlertTriangle, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { crearMovimientoManualAction, type ActionState } from './actions';

export type EntidadSgssOpt = {
  id: string;
  codigo: string;
  nombre: string;
  /** 'EPS' | 'ARL' — solo se exponen estas dos en el modal manual. */
  tipo: 'EPS' | 'ARL';
};

export type EmpresaOpt = {
  id: string;
  nit: string;
  nombre: string;
};

/**
 * Sprint Soporte reorg — Botón + dialog para registrar manualmente un
 * movimiento bancario.
 *
 * Cambios respecto a la versión anterior:
 * - Empresa planilla: nuevo selector (opcional pero recomendado).
 * - Entidad SGSS: reemplaza al campo "concepto" libre por un autocomplete
 *   filtrado a EPS y ARL (las únicas que pagan incapacidades hoy).
 * - Concepto: ahora opcional, sirve para el # de autorización o referencia
 *   particular del movimiento. Si se deja vacío, se autocompleta con el
 *   nombre de la entidad.
 */
export function RegistroManualButton({
  entidades,
  empresas,
}: {
  entidades: EntidadSgssOpt[];
  empresas: EmpresaOpt[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-blue bg-white px-3 text-xs font-medium text-brand-blue shadow-sm transition hover:bg-brand-blue/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Registro manual
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar movimiento manual"
        description="Para casos donde el extracto no se puede importar (PDF escaneado, ajustes contables, etc)."
        size="md"
      >
        <ManualForm onClose={() => setOpen(false)} entidades={entidades} empresas={empresas} />
      </Dialog>
    </>
  );
}

function ManualForm({
  onClose,
  entidades,
  empresas,
}: {
  onClose: () => void;
  entidades: EntidadSgssOpt[];
  empresas: EmpresaOpt[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    crearMovimientoManualAction,
    {},
  );

  // Cerrar el dialog ~700ms después de éxito y refrescar la lista.
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const t = setTimeout(() => onClose(), 700);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose, router]);

  const hoy = new Date();
  const today = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  // Autocomplete entidad SGSS — coincidencias por código o nombre.
  const [entidadQuery, setEntidadQuery] = useState('');
  const [entidadSel, setEntidadSel] = useState<EntidadSgssOpt | null>(null);
  const [entidadOpen, setEntidadOpen] = useState(false);

  const entidadesFiltradas = useMemo(() => {
    const q = entidadQuery.trim().toLowerCase();
    if (!q) return entidades.slice(0, 30);
    return entidades
      .filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.nombre.toLowerCase().includes(q) ||
          e.tipo.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [entidadQuery, entidades]);

  return (
    <form ref={formRef} action={submit} className="space-y-3">
      <input type="hidden" name="entidadSgssId" value={entidadSel?.id ?? ''} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fechaIngreso">
            Fecha <span className="text-red-500">*</span>
          </Label>
          <Input
            id="fechaIngreso"
            name="fechaIngreso"
            type="date"
            required
            defaultValue={today}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="bancoOrigen">Banco</Label>
          <Input
            id="bancoOrigen"
            name="bancoOrigen"
            placeholder="Bancolombia, Davivienda…"
            className="mt-1"
          />
        </div>
      </div>

      {/* Empresa planilla — selector simple (no necesita autocomplete porque
          la mayoría de aliados tiene 1-3 empresas). */}
      <div>
        <Label htmlFor="empresaId">Empresa planilla</Label>
        <select
          id="empresaId"
          name="empresaId"
          defaultValue=""
          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
        >
          <option value="">— Sin asignar (puedes asignarla después) —</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre} (NIT {e.nit})
            </option>
          ))}
        </select>
      </div>

      {/* Entidad SGSS (EPS/ARL) — autocomplete que filtra mientras escribes.
          Reemplaza el campo "concepto" libre que había antes. */}
      <div className="relative">
        <Label htmlFor="entidadQuery">
          Entidad SGSS (EPS / ARL) <span className="text-red-500">*</span>
        </Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="entidadQuery"
            type="text"
            value={entidadSel ? `${entidadSel.codigo} · ${entidadSel.nombre}` : entidadQuery}
            onChange={(e) => {
              setEntidadSel(null);
              setEntidadQuery(e.target.value);
              setEntidadOpen(true);
            }}
            onFocus={() => setEntidadOpen(true)}
            onBlur={() => {
              // Pequeño delay para permitir click en items.
              setTimeout(() => setEntidadOpen(false), 150);
            }}
            placeholder="Empieza a escribir EPS, SURA, COMPENSAR…"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            autoComplete="off"
          />
        </div>
        {entidadOpen && entidadesFiltradas.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {entidadesFiltradas.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    setEntidadSel(e);
                    setEntidadQuery('');
                    setEntidadOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                >
                  <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                    {e.tipo}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{e.codigo}</span>
                  <span className="flex-1 truncate">{e.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {entidadOpen && entidadesFiltradas.length === 0 && entidadQuery && (
          <p className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
            Sin coincidencias para &ldquo;{entidadQuery}&rdquo;
          </p>
        )}
        <p className="mt-1 text-[10px] text-slate-400">
          Solo se listan EPS y ARL — son las que pagan incapacidades.
        </p>
      </div>

      <div>
        <Label htmlFor="concepto">
          Concepto / referencia <span className="text-[10px] text-slate-400">(opcional)</span>
        </Label>
        <Input
          id="concepto"
          name="concepto"
          maxLength={500}
          placeholder="Ej. Autorización 12345 o # de transacción"
          className="mt-1"
        />
        <p className="mt-1 text-[10px] text-slate-400">
          Si lo dejas vacío, se autocompleta con el nombre de la entidad.
        </p>
      </div>

      <div>
        <Label htmlFor="valor">
          Valor (COP) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="valor"
          name="valor"
          type="number"
          step="1"
          min="1"
          required
          placeholder="1234567"
          className="mt-1"
        />
        <p className="mt-1 text-[10px] text-slate-400">
          Solo enteros. No incluyas $ ni puntos miles — el sistema formatea.
        </p>
      </div>

      {state.error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Movimiento registrado.</span>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !entidadSel}>
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </>
          ) : (
            'Registrar movimiento'
          )}
        </Button>
      </div>
    </form>
  );
}
