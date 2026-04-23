'use client';

import { useState, useTransition } from 'react';
import { Eye, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import type { SoporteAfEstado } from '@pila/db';
import { cn } from '@/lib/utils';
import { toggleEstadoAfiliacionAction } from './actions';
import { AfiliacionDialog } from './afiliacion-dialog';
import type {
  AfiliacionFormProps,
  InitialAfiliacion,
  CotizanteSnapshot,
  Modalidad,
} from './afiliacion-form';

const SOP_ESTADO_LABEL: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'En proceso',
  PROCESADA: 'Procesada',
  RECHAZADA: 'Rechazada',
  NOVEDAD: 'Novedad',
};
const SOP_ESTADO_TONE: Record<SoporteAfEstado, string> = {
  EN_PROCESO: 'bg-sky-50 text-sky-700 ring-sky-200',
  PROCESADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECHAZADA: 'bg-red-50 text-red-700 ring-red-200',
  NOVEDAD: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const DOC_LABELS: Record<string, string> = {
  CC: 'CC',
  CE: 'CE',
  NIT: 'NIT',
  PAS: 'PAS',
  TI: 'TI',
  RC: 'RC',
  NIP: 'NIP',
};

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export type AfiliacionRow = {
  id: string;
  modalidad: Modalidad;
  estado: string;
  nivelRiesgo: string;
  salario: number;
  fechaIngreso: string;
  /** Nombre del dueño aliado de la sucursal (solo se llena para staff). */
  duenoAliado: string | null;
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    primerNombre: string;
    segundoNombre: string | null;
    primerApellido: string;
    segundoApellido: string | null;
  };
  empresa: { nit: string; nombre: string } | null;
  tipoCotizante: { codigo: string; nombre: string };
  plan: {
    codigo: string;
    nombre: string;
    regimen: 'ORDINARIO' | 'RESOLUCION' | 'AMBOS';
  } | null;
  regimen: 'ORDINARIO' | 'RESOLUCION' | null;
  /** Último estado de la bandeja Soporte · Afiliaciones para esta afiliación. */
  estadoSoporte: SoporteAfEstado | null;
  initial: InitialAfiliacion;
};

type Props = {
  rows: AfiliacionRow[];
  emptyMessage: string;
  // Catálogos compartidos para los modales de edit/view
  catalogos: Omit<AfiliacionFormProps, 'mode' | 'modalidad' | 'initial' | 'afiliacionId' | 'cotizanteSnapshot' | 'onSuccess'>;
  /** Muestra la columna "Dueño aliado" (solo staff). */
  mostrarDueno?: boolean;
};

/** Nombre corto para la tabla: solo primer nombre + primer apellido. */
function shortName(c: AfiliacionRow['cotizante']) {
  return [c.primerNombre, c.primerApellido].filter(Boolean).join(' ');
}

/** Nombre completo para el encabezado del modal de detalle/edición. */
function fullName(c: AfiliacionRow['cotizante']) {
  return [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

export function AfiliacionesTable({ rows, emptyMessage, catalogos, mostrarDueno = false }: Props) {
  const [dialog, setDialog] = useState<
    | { mode: 'edit' | 'view'; row: AfiliacionRow }
    | null
  >(null);
  const [pendingToggle, startTransition] = useTransition();
  const [toggleId, setToggleId] = useState<string | null>(null);

  function openEdit(row: AfiliacionRow) {
    setDialog({ mode: 'edit', row });
  }
  function openView(row: AfiliacionRow) {
    setDialog({ mode: 'view', row });
  }
  function toggleEstado(row: AfiliacionRow) {
    setToggleId(row.id);
    startTransition(async () => {
      await toggleEstadoAfiliacionAction(row.id);
      setToggleId(null);
    });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {mostrarDueno && <th className="px-4 py-2">Dueño aliado</th>}
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Modalidad</th>
              <th className="px-4 py-2">Régimen</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Nivel</th>
              <th className="px-4 py-2 text-right">Salario</th>
              <th className="px-4 py-2">Ingreso</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Estado Sop.</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={mostrarDueno ? 13 : 12} className="px-4 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const isActiva = a.estado === 'ACTIVA';
              const isToggling = pendingToggle && toggleId === a.id;
              return (
                <tr key={a.id}>
                  {mostrarDueno && (
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {a.duenoAliado ?? <span className="italic text-slate-400">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs">
                    {DOC_LABELS[a.cotizante.tipoDocumento] ?? a.cotizante.tipoDocumento}{' '}
                    {a.cotizante.numeroDocumento}
                  </td>
                  <td className="px-4 py-3">{shortName(a.cotizante)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                        a.modalidad === 'DEPENDIENTE'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {a.modalidad === 'DEPENDIENTE' ? 'Dep.' : 'Indep.'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.regimen ? (
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          a.regimen === 'ORDINARIO'
                            ? 'bg-sky-50 text-sky-700 ring-sky-200'
                            : 'bg-violet-50 text-violet-700 ring-violet-200',
                        )}
                      >
                        {a.regimen === 'ORDINARIO' ? 'Ordinario' : 'Resolución'}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.plan ? (
                      <span className="font-medium">{a.plan.nombre}</span>
                    ) : (
                      <span className="italic text-slate-400">Sin plan</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.empresa ? (
                      <>
                        <p className="text-xs text-slate-500">{a.empresa.nit}</p>
                        <p>{a.empresa.nombre}</p>
                      </>
                    ) : (
                      <span className="text-xs italic text-slate-400">
                        — sin empresa (independiente) —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.nivelRiesgo}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {copFmt.format(a.salario)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.fechaIngreso}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                        isActiva
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-red-50 text-red-700 ring-red-200',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isActiva ? 'bg-emerald-500' : 'bg-red-500',
                        )}
                      />
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.estadoSoporte ? (
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          SOP_ESTADO_TONE[a.estadoSoporte],
                        )}
                        title="Último estado en la bandeja Soporte · Afiliaciones"
                      >
                        {SOP_ESTADO_LABEL[a.estadoSoporte]}
                      </span>
                    ) : (
                      <span className="italic text-slate-400 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        title="Consultar"
                        onClick={() => openView(a)}
                        color="slate"
                      >
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        title="Editar"
                        onClick={() => openEdit(a)}
                        color="blue"
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        title={isActiva ? 'Inactivar' : 'Activar'}
                        onClick={() => toggleEstado(a)}
                        disabled={isToggling}
                        color={isActiva ? 'amber' : 'emerald'}
                      >
                        {isActiva ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog && (
        <AfiliacionDialog
          open={!!dialog}
          onClose={() => setDialog(null)}
          mode={dialog.mode}
          modalidad={dialog.row.modalidad}
          afiliacionId={dialog.row.id}
          initial={dialog.row.initial}
          cotizanteSnapshot={{
            tipoDocumento:
              DOC_LABELS[dialog.row.cotizante.tipoDocumento] ??
              dialog.row.cotizante.tipoDocumento,
            numeroDocumento: dialog.row.cotizante.numeroDocumento,
            nombreCompleto: fullName(dialog.row.cotizante),
          }}
          {...catalogos}
        />
      )}
    </>
  );
}

type IconButtonProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  color: 'blue' | 'slate' | 'amber' | 'emerald';
  children: React.ReactNode;
};

function IconButton({ title, onClick, disabled, color, children }: IconButtonProps) {
  const colorMap: Record<IconButtonProps['color'], string> = {
    blue: 'text-brand-blue hover:bg-brand-blue/10 hover:text-brand-blue-dark',
    slate: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
    amber: 'text-amber-600 hover:bg-amber-50 hover:text-amber-700',
    emerald: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-50',
        colorMap[color],
      )}
    >
      {children}
    </button>
  );
}
