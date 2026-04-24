'use client';

import { useActionState, useState, useTransition } from 'react';
import { Plus, Loader2, Search, Check, AlertTriangle } from 'lucide-react';
import { crearDetalleAction, buscarCotizanteAction, type ActionState } from './actions';

/**
 * Form para agregar un nuevo detalle a un movimiento. Flujo:
 *  1. Usuario escribe tipoDoc + numDoc
 *  2. Click "Buscar" → busca cotizante, llena nombre + sucursal + última incapacidad
 *  3. Ingresa subtotal; retenciones se calculan EN VIVO
 *  4. Selecciona forma de pago y guarda
 */

const RETENCION_4X1000 = 0.004;
const RETENCION_IMPUESTO = 0.035;

function fmtCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function NuevoDetalleForm({ movimientoId }: { movimientoId: string }) {
  const submitBound = crearDetalleAction.bind(null, movimientoId);
  const [state, submit, pending] = useActionState<ActionState, FormData>(submitBound, {});

  const [tipoDoc, setTipoDoc] = useState('CC');
  const [numDoc, setNumDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [cotizanteId, setCotizanteId] = useState('');
  const [incapacidadId, setIncapacidadId] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [mensajeBusqueda, setMensajeBusqueda] = useState<string | null>(null);

  const [buscarTransition, startBuscar] = useTransition();

  const subtotalN = Number(subtotal) || 0;
  const ret4x1000 = subtotalN * RETENCION_4X1000;
  const retImpuesto = subtotalN * RETENCION_IMPUESTO;
  const total = Math.max(0, subtotalN - ret4x1000 - retImpuesto);

  function buscar() {
    setMensajeBusqueda(null);
    startBuscar(async () => {
      const res = await buscarCotizanteAction(tipoDoc, numDoc);
      if (!res.ok) {
        setMensajeBusqueda(res.error ?? 'No encontrado');
        setNombre('');
        setCotizanteId('');
        setIncapacidadId('');
        setSucursalId('');
        return;
      }
      if (res.cotizante) {
        setNombre(res.cotizante.nombreCompleto);
        setCotizanteId(res.cotizante.id);
        setSucursalId(res.cotizante.sucursalId ?? '');
      }
      if (res.incapacidad) {
        setIncapacidadId(res.incapacidad.id);
        setFechaInicio(res.incapacidad.fechaInicio);
        setFechaFin(res.incapacidad.fechaFin);
        setSucursalId(res.incapacidad.sucursalId);
        setMensajeBusqueda(`✓ Asociada a incapacidad ${res.incapacidad.consecutivo}`);
      } else {
        setMensajeBusqueda(
          '✓ Cotizante encontrado — sin incapacidad asociada (se guardará sin enlace)',
        );
      }
    });
  }

  return (
    <form action={submit} className="space-y-3">
      {/* Hidden FKs resueltas desde búsqueda */}
      <input type="hidden" name="cotizanteId" value={cotizanteId} />
      <input type="hidden" name="incapacidadId" value={incapacidadId} />
      <input type="hidden" name="sucursalId" value={sucursalId} />

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Tipo doc <span className="text-red-500">*</span>
          </label>
          <select
            name="tipoDocumento"
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
          >
            <option>CC</option>
            <option>CE</option>
            <option>TI</option>
            <option>PAS</option>
            <option>NIT</option>
            <option>NIP</option>
            <option>RC</option>
          </select>
        </div>
        <div className="col-span-7">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Número doc <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="numeroDocumento"
            required
            value={numDoc}
            onChange={(e) => setNumDoc(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm"
          />
        </div>
        <div className="col-span-2 flex items-end">
          <button
            type="button"
            onClick={buscar}
            disabled={buscarTransition || !numDoc}
            className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Buscar cotizante"
          >
            {buscarTransition ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {mensajeBusqueda && (
        <p className="flex items-start gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
          {mensajeBusqueda.startsWith('✓') ? (
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          )}
          <span>{mensajeBusqueda}</span>
        </p>
      )}

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Nombre completo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="nombreCompleto"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Fecha inicio inc.
          </label>
          <input
            type="date"
            name="fechaInicioInc"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Fecha fin inc.
          </label>
          <input
            type="date"
            name="fechaFinInc"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Forma de pago <span className="text-red-500">*</span>
        </label>
        <select
          name="formaPago"
          required
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
          defaultValue="PAGO_COTIZANTE"
        >
          <option value="PAGO_COTIZANTE">Pago a cotizante</option>
          <option value="PAGO_ALIADO">Pago a aliado</option>
          <option value="CRUCE_COBRO_ALIADO">Cruce en cobro aliado</option>
        </select>
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Subtotal (COP) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="subtotal"
          required
          min="0.01"
          step="0.01"
          value={subtotal}
          onChange={(e) => setSubtotal(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm"
        />
      </div>

      {/* Retenciones calculadas en vivo */}
      {subtotalN > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="mb-1 font-medium text-slate-700">Retenciones automáticas</p>
          <dl className="space-y-0.5">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-mono">{fmtCOP(subtotalN)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">4×1000 (0.4%)</dt>
              <dd className="font-mono text-red-700">-{fmtCOP(ret4x1000)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Impuesto (3.5%)</dt>
              <dd className="font-mono text-red-700">-{fmtCOP(retImpuesto)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <dt>Total a pagar</dt>
              <dd className="font-mono text-emerald-700">{fmtCOP(total)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Observaciones
        </label>
        <textarea
          name="observaciones"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ Detalle agregado
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Agregar detalle
      </button>
    </form>
  );
}
