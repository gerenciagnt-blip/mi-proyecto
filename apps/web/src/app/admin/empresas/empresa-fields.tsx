'use client';

import { useState, useEffect } from 'react';
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
  telefono: string;
  email: string;
  ciiuPrincipal: string;
}>;

const input =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const label = 'block text-xs font-medium text-slate-600';
const section = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

export function EmpresaFields({ initial }: { initial?: InitialValues }) {
  const [nit, setNit] = useState(initial?.nit ?? '');
  const [dv, setDv] = useState(initial?.dv ?? '');
  const [dvAuto, setDvAuto] = useState(!initial?.dv);

  useEffect(() => {
    if (dvAuto) {
      const calc = calcularDV(nit);
      setDv(calc ?? '');
    }
  }, [nit, dvAuto]);

  return (
    <div className="space-y-4">
      {/* Identificación */}
      <section className={section}>
        <h3 className={sectionTitle}>Identificación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={label}>NIT (sin DV)</label>
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
            <label className={label}>Tipo persona</label>
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
            <label className={label}>Razón social</label>
            <input
              name="nombre"
              required
              defaultValue={initial?.nombre}
              className={input}
            />
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
            <label className={label}>Tipo doc.</label>
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
            <label className={label}>Número doc.</label>
            <input
              name="repLegalNumeroDoc"
              required
              defaultValue={initial?.repLegalNumeroDoc}
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Nombre completo</label>
            <input
              name="repLegalNombre"
              required
              defaultValue={initial?.repLegalNombre}
              className={input}
            />
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section className={section}>
        <h3 className={sectionTitle}>Ubicación y contacto</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={label}>Dirección</label>
            <input
              name="direccion"
              required
              defaultValue={initial?.direccion}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Ciudad</label>
            <input
              name="ciudad"
              required
              defaultValue={initial?.ciudad}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Departamento</label>
            <input
              name="departamento"
              required
              defaultValue={initial?.departamento}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Teléfono</label>
            <input
              name="telefono"
              required
              defaultValue={initial?.telefono}
              className={input}
            />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Correo electrónico</label>
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
            <label className={label}>CIIU principal</label>
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
          <div className="sm:col-span-3">
            <p className="mt-6 text-xs text-slate-500">
              ARL, niveles de riesgo permitidos, tipos/subtipos de cotizante y actividades
              adicionales se configuran en Fase 1.5.3 (después de los catálogos).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
