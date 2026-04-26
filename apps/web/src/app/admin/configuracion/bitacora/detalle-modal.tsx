'use client';

import { useState } from 'react';
import { Eye, Network, FileSearch } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

/**
 * Modal de detalle de un evento de bitácora. Muestra:
 *
 *   - Encabezado: usuario, rol, fecha, IP
 *   - Tarjeta de la entidad afectada (tipo + id + sucursal)
 *   - Tabla de cambios "campo · antes · después" — solo se muestra si
 *     el evento tiene `cambios` poblado (los registros legacy de la
 *     bitácora pueden no tenerlos).
 *
 * El botón trigger queda colocado por la fila padre. Este componente
 * gestiona su propio open/close para que la fila padre pueda quedarse
 * como server component pasando data ya serializada.
 */
export type EventoBitacora = {
  id: string;
  entidad: string;
  entidadId: string;
  accion: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  userSucursalCodigo: string | null;
  entidadSucursalCodigo: string | null;
  descripcion: string | null;
  ip: string | null;
  createdAt: string; // ISO — serializable cross client/server
  /**
   * Cambios estructurados. Schema: { antes: { ... }, despues: { ... },
   * campos: [...] }. Los registros legacy pueden tener un objeto distinto
   * (ej. { errores: [...] }), por eso `unknown`.
   */
  cambios: unknown;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  SOPORTE: 'Soporte',
  ALIADO_OWNER: 'Dueño Aliado',
  ALIADO_USER: 'Usuario Aliado',
};

/**
 * Heurística: ¿el `cambios` del evento sigue el shape estándar
 * `{ antes, despues, campos }` que produce `auditarUpdate/Create/Delete`?
 * Si sí, lo renderizamos como diff bonito; si no, mostramos JSON crudo.
 */
function esDiffEstandar(
  cambios: unknown,
): cambios is {
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  campos: string[];
} {
  if (!cambios || typeof cambios !== 'object') return false;
  const c = cambios as Record<string, unknown>;
  return (
    'antes' in c &&
    'despues' in c &&
    'campos' in c &&
    typeof c.antes === 'object' &&
    typeof c.despues === 'object' &&
    Array.isArray(c.campos)
  );
}

/**
 * Formatea un valor para mostrar en la tabla de diff. Strings van como
 * tales, null/undefined como "—", booleanos como sí/no, objetos como
 * JSON inline. Mantiene la salida compacta — los objetos largos se
 * truncan visualmente con CSS, no aquí.
 */
function formatearValor(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

export function DetalleEventoTrigger({ evento }: { evento: EventoBitacora }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Ver detalle del evento"
        title="Ver detalle"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-brand-blue" />
            Detalle del evento
          </div>
        }
        description={evento.descripcion ?? undefined}
      >
        <ContenidoDetalle evento={evento} />
      </Dialog>
    </>
  );
}

function ContenidoDetalle({ evento }: { evento: EventoBitacora }) {
  const fechaFmt = new Date(evento.createdAt).toLocaleString('es-CO', {
    dateStyle: 'long',
    timeStyle: 'medium',
  });

  return (
    <div className="space-y-4 text-xs">
      {/* Encabezado: actor + cuándo */}
      <section className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-[11px]">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Usuario</p>
          {evento.userName ? (
            <p className="mt-0.5 font-medium text-slate-900">
              {evento.userName}
              {evento.userRole && (
                <span className="ml-1 font-normal text-slate-500">
                  ({ROLE_LABELS[evento.userRole] ?? evento.userRole})
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 italic text-slate-400">Sistema</p>
          )}
          {evento.userSucursalCodigo && (
            <p className="mt-0.5 font-mono text-[10px] text-slate-400">
              Sucursal: {evento.userSucursalCodigo}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Cuándo</p>
          <p className="mt-0.5 font-medium text-slate-900">{fechaFmt}</p>
          {evento.ip && (
            <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-400">
              <Network className="h-2.5 w-2.5" />
              {evento.ip}
            </p>
          )}
        </div>
      </section>

      {/* Entidad afectada */}
      <section className="rounded-lg border border-slate-200 p-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Entidad afectada</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-brand-blue/10 px-2 py-0.5 text-[11px] font-semibold text-brand-blue-dark">
            {evento.entidad}
          </span>
          <span className="font-mono text-[10px] text-slate-500">{evento.entidadId}</span>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            {evento.accion}
          </span>
          {evento.entidadSucursalCodigo && (
            <span className="rounded-md border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-500">
              {evento.entidadSucursalCodigo}
            </span>
          )}
        </div>
      </section>

      {/* Diff */}
      {evento.cambios === null || evento.cambios === undefined ? (
        <section className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
          Este evento no tiene detalle de cambios.
        </section>
      ) : esDiffEstandar(evento.cambios) ? (
        <DiffEstandar cambios={evento.cambios} accion={evento.accion} />
      ) : (
        <section className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Datos extra</p>
          <pre className="max-h-72 overflow-auto rounded-md bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700">
            {JSON.stringify(evento.cambios, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function DiffEstandar({
  cambios,
  accion,
}: {
  cambios: { antes: Record<string, unknown>; despues: Record<string, unknown>; campos: string[] };
  accion: string;
}) {
  const isCreate = accion === 'CREAR';
  const isDelete = accion === 'ELIMINAR';

  // En CREATE solo mostramos columna "Después"; en DELETE solo "Antes";
  // en EDITAR ambas. Los demás (acciones libres) muestran ambas si hay datos.
  const mostrarAntes = !isCreate;
  const mostrarDespues = !isDelete;

  return (
    <section className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Cambios ({cambios.campos.length} campo{cambios.campos.length !== 1 ? 's' : ''})
        </p>
      </div>
      <table className="w-full text-[11px]">
        <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Campo</th>
            {mostrarAntes && <th className="px-3 py-2 text-left font-medium">Antes</th>}
            {mostrarDespues && <th className="px-3 py-2 text-left font-medium">Después</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cambios.campos.map((campo) => (
            <tr key={campo} className="align-top">
              <td className="px-3 py-2 font-mono text-[10px] text-slate-700">{campo}</td>
              {mostrarAntes && (
                <td className="max-w-[280px] break-words px-3 py-2 text-slate-500">
                  {isCreate ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 ring-1 ring-inset ring-rose-100">
                      {formatearValor(cambios.antes[campo])}
                    </span>
                  )}
                </td>
              )}
              {mostrarDespues && (
                <td className="max-w-[280px] break-words px-3 py-2 text-slate-700">
                  {isDelete ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-100">
                      {formatearValor(cambios.despues[campo])}
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
