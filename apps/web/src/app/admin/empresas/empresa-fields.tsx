'use client';

import { useState, useEffect, useMemo } from 'react';
import { calcularDV } from '@/lib/nit';

type InitialValues = Partial<{
  nit: string;
  dv: string;
  nombre: string;
  nombreComercial: string;
  tipoPersona: string;
  repLegalTipoDoc: string;
  repLegalNumeroDoc: string;
  repLegalNombre: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  departamentoId: string;
  municipioId: string;
  telefono: string;
  email: string;
  ciiuPrincipal: string;
  arlId: string;
  exoneraLey1607: boolean;
  /** Fecha de inicio de actividades — formato YYYY-MM-DD para input type=date. */
  fechaInicioActividades: string;
  /** ID interno del aportante en PagoSimple (Integer asignado por el
   * operador). Se ve en la URL del panel cuando seleccionas el aportante. */
  pagosimpleContributorId: string;
}>;

type Arl = { id: string; codigo: string; nombre: string };

export type DeptoOpt = {
  id: string;
  nombre: string;
  municipios: { id: string; nombre: string }[];
};

const input =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50';
const label = 'block text-xs font-medium text-slate-600';
const section = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

export function EmpresaFields({
  initial,
  arls = [],
  departamentos = [],
}: {
  initial?: InitialValues;
  arls?: Arl[];
  departamentos?: DeptoOpt[];
}) {
  const [nit, setNit] = useState(initial?.nit ?? '');
  const [dv, setDv] = useState(initial?.dv ?? '');
  const [dvAuto, setDvAuto] = useState(!initial?.dv);

  useEffect(() => {
    if (dvAuto) {
      const calc = calcularDV(nit);
      setDv(calc ?? '');
    }
  }, [nit, dvAuto]);

  // DIVIPOLA cascada depto → municipio
  const [deptoId, setDeptoId] = useState(initial?.departamentoId ?? '');
  const [muniId, setMuniId] = useState(initial?.municipioId ?? '');
  const depto = useMemo(
    () => departamentos.find((d) => d.id === deptoId),
    [departamentos, deptoId],
  );
  const muni = useMemo(() => depto?.municipios.find((m) => m.id === muniId), [depto, muniId]);

  // Si al cambiar depto el municipio ya no está, resetear
  useEffect(() => {
    if (muniId && !depto?.municipios.some((m) => m.id === muniId)) {
      setMuniId('');
    }
  }, [depto, muniId]);

  return (
    <div className="space-y-4">
      {/* Identificación */}
      <section className={section}>
        <h3 className={sectionTitle}>Identificación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={label}>NIT (sin DV) *</label>
            <input
              name="nit"
              required
              value={nit}
              onChange={(e) => setNit(e.target.value.replace(/\D/g, ''))}
              placeholder="900123456"
              className={input}
            />
          </div>
          <div>
            <label className={label}>DV</label>
            <input
              name="dv"
              maxLength={1}
              value={dv}
              onChange={(e) => {
                setDvAuto(false);
                setDv(e.target.value.replace(/\D/g, ''));
              }}
              placeholder="7"
              className={input}
            />
            <p className="mt-1 text-[10px] text-slate-400">
              {dvAuto ? 'Auto-calculado' : 'Manual'}
            </p>
          </div>
          <div>
            <label className={label}>Tipo persona *</label>
            <select
              name="tipoPersona"
              required
              defaultValue={initial?.tipoPersona ?? 'JURIDICA'}
              className={input}
            >
              <option value="JURIDICA">Jurídica</option>
              <option value="NATURAL">Natural</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Razón social *</label>
            <input name="nombre" required defaultValue={initial?.nombre} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Nombre comercial (opcional)</label>
            <input
              name="nombreComercial"
              defaultValue={initial?.nombreComercial}
              className={input}
            />
          </div>
        </div>
      </section>

      {/* Representante legal */}
      <section className={section}>
        <h3 className={sectionTitle}>Representante legal</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={label}>Tipo doc. *</label>
            <select
              name="repLegalTipoDoc"
              required
              defaultValue={initial?.repLegalTipoDoc ?? 'CC'}
              className={input}
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="NIT">NIT</option>
              <option value="PAS">PAS</option>
              <option value="TI">TI</option>
              <option value="RC">RC</option>
              <option value="NIP">NIP</option>
            </select>
          </div>
          <div>
            <label className={label}>Número doc. *</label>
            <input
              name="repLegalNumeroDoc"
              required
              defaultValue={initial?.repLegalNumeroDoc}
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Nombre completo *</label>
            <input
              name="repLegalNombre"
              required
              defaultValue={initial?.repLegalNombre}
              className={input}
            />
          </div>
        </div>
      </section>

      {/* Contacto + DIVIPOLA */}
      <section className={section}>
        <h3 className={sectionTitle}>Ubicación y contacto</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={label}>Dirección *</label>
            <input name="direccion" required defaultValue={initial?.direccion} className={input} />
          </div>
          <div>
            <label className={label}>Departamento *</label>
            <select
              value={deptoId}
              onChange={(e) => {
                setDeptoId(e.target.value);
                setMuniId('');
              }}
              required
              className={input}
            >
              <option value="">— Seleccionar —</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
            <input type="hidden" name="departamentoId" value={deptoId} />
            {/* Mantenemos el texto legado sincronizado para no romper reportería previa */}
            <input type="hidden" name="departamento" value={depto?.nombre ?? ''} />
          </div>
          <div>
            <label className={label}>Municipio *</label>
            <select
              value={muniId}
              onChange={(e) => setMuniId(e.target.value)}
              disabled={!depto}
              required
              className={input}
            >
              <option value="">{depto ? '— Seleccionar —' : 'Primero elige departamento'}</option>
              {depto?.municipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <input type="hidden" name="municipioId" value={muniId} />
            <input type="hidden" name="ciudad" value={muni?.nombre ?? ''} />
          </div>
          <div>
            <label className={label}>Teléfono *</label>
            <input name="telefono" required defaultValue={initial?.telefono} className={input} />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Correo electrónico *</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={initial?.email}
              className={input}
            />
          </div>
        </div>
      </section>

      {/* PILA */}
      <section className={section}>
        <h3 className={sectionTitle}>PILA</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={label}>CIIU principal *</label>
            <input
              name="ciiuPrincipal"
              required
              maxLength={4}
              pattern="[0-9]{4}"
              defaultValue={initial?.ciiuPrincipal}
              placeholder="6202"
              className={input}
            />
            <p className="mt-1 text-[10px] text-slate-400">4 dígitos</p>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>ARL actual</label>
            <select name="arlId" defaultValue={initial?.arlId ?? ''} className={input}>
              <option value="">— Sin asignar —</option>
              {arls.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
            {arls.length === 0 && (
              <p className="mt-1 text-[10px] text-amber-700">
                No hay ARLs en el catálogo — agrégalas en /admin/catalogos/arl
              </p>
            )}
          </div>
          <div className="sm:col-span-1 flex items-end">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
              <input
                type="checkbox"
                name="exoneraLey1607"
                defaultChecked={initial?.exoneraLey1607 ?? false}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>
                Exonera <span className="font-mono">Ley 1607</span>
              </span>
            </label>
          </div>
          <div>
            <label className={label}>Fecha inicio actividades</label>
            <input
              type="date"
              name="fechaInicioActividades"
              defaultValue={initial?.fechaInicioActividades ?? ''}
              max={new Date().toISOString().slice(0, 10)}
              className={input}
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Requerida por PagoSimple al sincronizar
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>ID PagoSimple (aportante)</label>
            <input
              type="text"
              name="pagosimpleContributorId"
              defaultValue={initial?.pagosimpleContributorId ?? ''}
              placeholder="ej. 12345"
              className={input}
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Número entero asignado por el operador. Lo ves en la URL del panel cuando seleccionas
              el aportante (ej. /aportante/<strong>12345</strong>/...). Necesario para validar
              planillas.
            </p>
          </div>
          <div className="sm:col-span-4">
            <p className="mt-2 text-xs text-slate-500">
              Niveles de riesgo permitidos, actividades adicionales y tipos/subtipos de cotizante se
              configuran en la pestaña <strong>Configuración PILA</strong> (disponible tras crear la
              empresa).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
