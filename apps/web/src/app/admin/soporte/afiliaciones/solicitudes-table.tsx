'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { SoporteAfEstado, SoporteAfTipoDisparo } from '@pila/db';
import { cn } from '@/lib/utils';
import { DetalleModal } from './detalle-modal';
import { AsignarPopover } from './asignar-popover';
import type { ArlStatus } from '@/lib/soporte-af/arl-status';
import type { StaffAsignable } from './actions';

const ESTADO_LABEL: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'En proceso',
  PROCESADA: 'Procesada',
  RECHAZADA: 'Rechazada',
  NOVEDAD: 'Novedad',
};
const ESTADO_TONE: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PROCESADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
  NOVEDAD: 'bg-amber-50 text-amber-700 ring-amber-200',
};
const DISPARO_LABEL: Record<SoporteAfTipoDisparo, string> = {
  NUEVA: 'Nueva',
  REACTIVACION: 'Reactivación',
  CAMBIO_FECHA_INGRESO: 'Cambio fecha',
  CAMBIO_EMPRESA: 'Cambio empresa',
  CAMBIO_NIVEL_ARL: 'Cambio nivel ARL',
  CAMBIO_PLAN_SGSS: 'Cambio plan',
};

export type SolicitudRow = {
  id: string;
  consecutivo: string;
  fechaRadicacion: string; // ISO
  aliadoNombre: string | null;
  sucursalCodigo: string | null;
  cotizanteNombre: string;
  cotizanteDoc: string;
  modalidadLabel: string;
  planLabel: string | null;
  regimenLabel: string | null;
  disparos: SoporteAfTipoDisparo[];
  cantidadDocs: number;
  estado: SoporteAfEstado;
  /** Sprint Soporte reorg — estado del bot ARL si aplica al plan/empresa. */
  arlStatus: ArlStatus | null;
  /** Sprint Soporte reorg — usuario asignado a la solicitud. */
  asignadoA: { id: string; name: string } | null;
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString('es-CO'),
    hora: d.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function inicialesDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function SolicitudesTable({
  rows,
  staffAsignables,
}: {
  rows: SolicitudRow[];
  staffAsignables: StaffAsignable[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Sin solicitudes con los filtros actuales.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Consecutivo</th>
              <th className="px-3 py-2">Recibido</th>
              <th className="px-3 py-2">Aliado</th>
              <th className="px-3 py-2">Cotizante</th>
              <th className="px-3 py-2">Modalidad</th>
              {/* Plan + Régimen unidos en una sola columna para ahorrar espacio. */}
              <th className="px-3 py-2">Plan / Régimen</th>
              <th className="px-3 py-2">Disparos</th>
              <th className="px-3 py-2 text-center">Estado ARL</th>
              <th className="px-3 py-2 text-center">Docs</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Asignado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => {
              const { fecha, hora } = fmtDateTime(s.fechaRadicacion);
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td
                    className="cursor-pointer px-3 py-2 font-mono text-xs font-semibold text-brand-blue hover:underline"
                    onClick={() => setOpenId(s.id)}
                  >
                    {s.consecutivo}
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 text-[11px] text-slate-500"
                    onClick={() => setOpenId(s.id)}
                  >
                    <p>{fecha}</p>
                    <p className="font-mono text-[10px] text-slate-400">{hora}</p>
                  </td>
                  <td className="cursor-pointer px-3 py-2 text-xs" onClick={() => setOpenId(s.id)}>
                    <p className="font-medium text-slate-900">{s.aliadoNombre ?? '—'}</p>
                    {s.sucursalCodigo && (
                      <p className="font-mono text-[10px] text-slate-500">{s.sucursalCodigo}</p>
                    )}
                  </td>
                  <td className="cursor-pointer px-3 py-2 text-xs" onClick={() => setOpenId(s.id)}>
                    <p className="font-medium">{s.cotizanteNombre}</p>
                    <p className="font-mono text-[10px] text-slate-500">{s.cotizanteDoc}</p>
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 text-[11px] text-slate-600"
                    onClick={() => setOpenId(s.id)}
                  >
                    {s.modalidadLabel}
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 text-[11px]"
                    onClick={() => setOpenId(s.id)}
                  >
                    <p className="font-medium text-slate-700">{s.planLabel ?? '—'}</p>
                    <p className="text-[10px] text-slate-500">{s.regimenLabel ?? '—'}</p>
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => setOpenId(s.id)}>
                    <div className="flex flex-wrap gap-1">
                      {s.disparos.map((d) => (
                        <span
                          key={d}
                          className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                        >
                          {DISPARO_LABEL[d]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 text-center"
                    onClick={() => setOpenId(s.id)}
                  >
                    {s.arlStatus ? (
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          s.arlStatus.tone,
                        )}
                      >
                        {s.arlStatus.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 text-center text-[11px] text-slate-500"
                    onClick={() => setOpenId(s.id)}
                  >
                    <Paperclip className="mr-0.5 inline h-3 w-3" />
                    {s.cantidadDocs}
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => setOpenId(s.id)}>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        ESTADO_TONE[s.estado],
                      )}
                    >
                      {ESTADO_LABEL[s.estado]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {/* No abre detalle al click — el popover gestiona su propio
                       estado. Por eso este td no tiene cursor-pointer. */}
                    <AsignarPopover
                      soporteAfId={s.id}
                      actual={s.asignadoA}
                      staff={staffAsignables}
                      compact
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DetalleModal
        soporteAfId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        staffAsignables={staffAsignables}
      />
    </>
  );
}

// Helper exportado para uso en otros lugares (modal detalle).
export { inicialesDe };
