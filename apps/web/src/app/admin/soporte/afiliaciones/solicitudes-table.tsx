'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { SoporteAfEstado, SoporteAfTipoDisparo } from '@pila/db';
import { cn } from '@/lib/utils';
import { DetalleModal } from './detalle-modal';

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

export function SolicitudesTable({ rows }: { rows: SolicitudRow[] }) {
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
              <th className="px-4 py-2">Consecutivo</th>
              <th className="px-4 py-2">Recibido</th>
              <th className="px-4 py-2">Aliado</th>
              <th className="px-4 py-2">Cotizante</th>
              <th className="px-4 py-2">Modalidad</th>
              <th className="px-4 py-2">Plan SGSS</th>
              <th className="px-4 py-2">Régimen</th>
              <th className="px-4 py-2">Disparos</th>
              <th className="px-4 py-2">Docs</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => {
              const { fecha, hora } = fmtDateTime(s.fechaRadicacion);
              return (
                <tr
                  key={s.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setOpenId(s.id)}
                >
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-blue hover:underline">
                    {s.consecutivo}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">
                    <p>{fecha}</p>
                    <p className="font-mono text-[10px] text-slate-400">{hora}</p>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <p className="font-medium text-slate-900">
                      {s.aliadoNombre ?? '—'}
                    </p>
                    {s.sucursalCodigo && (
                      <p className="font-mono text-[10px] text-slate-500">
                        {s.sucursalCodigo}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <p className="font-medium">{s.cotizanteNombre}</p>
                    <p className="font-mono text-[10px] text-slate-500">
                      {s.cotizanteDoc}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-600">
                    {s.modalidadLabel}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-600">
                    {s.planLabel ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-600">
                    {s.regimenLabel ?? '—'}
                  </td>
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2 text-[11px] text-slate-500">
                    <Paperclip className="mr-0.5 inline h-3 w-3" />
                    {s.cantidadDocs}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        ESTADO_TONE[s.estado],
                      )}
                    >
                      {ESTADO_LABEL[s.estado]}
                    </span>
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
      />
    </>
  );
}
