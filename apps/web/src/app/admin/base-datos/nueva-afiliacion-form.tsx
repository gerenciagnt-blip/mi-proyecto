'use client';

import { useActionState, useState, useMemo, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createAfiliacionAction, type ActionState } from './actions';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base text-brand-text-primary sm:text-sm';

const sectionCls = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

const NIVELES = ['I', 'II', 'III', 'IV', 'V'] as const;

export type EmpresaOpt = {
  id: string;
  nit: string;
  nombre: string;
  sucursalId: string | null;
  niveles: string[]; // los permitidos; vacío = todos
  tiposIds: string[];
  subtiposIds: string[];
};

export type TipoOpt = {
  id: string;
  codigo: string;
  nombre: string;
  subtipos: { id: string; codigo: string; nombre: string }[];
};

export type DeptoOpt = {
  id: string;
  nombre: string;
  municipios: { id: string; nombre: string }[];
};

export type EntidadOpt = { id: string; codigo: string; nombre: string };
export type CuentaCobroOpt = {
  id: string;
  codigo: string;
  razonSocial: string;
  sucursalId: string;
};
export type AsesorOpt = { id: string; codigo: string; nombre: string };
export type ServicioOpt = { id: string; codigo: string; nombre: string; precio: number };

export type NuevaAfiliacionFormProps = {
  empresas: EmpresaOpt[];
  tipos: TipoOpt[];
  departamentos: DeptoOpt[];
  eps: EntidadOpt[];
  afp: EntidadOpt[];
  ccf: EntidadOpt[];
  cuentasCobro: CuentaCobroOpt[];
  asesores: AsesorOpt[];
  servicios: ServicioOpt[];
  smlv: number;
  onSuccess?: () => void;
};

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function NuevaAfiliacionForm(props: NuevaAfiliacionFormProps) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAfiliacionAction,
    {},
  );

  // Cascadas empresa
  const [empresaId, setEmpresaId] = useState('');
  const empresa = useMemo(() => props.empresas.find((e) => e.id === empresaId), [
    props.empresas,
    empresaId,
  ]);

  // Cascada tipo cotizante → subtipos
  const [tipoId, setTipoId] = useState('');
  const tipo = useMemo(() => props.tipos.find((t) => t.id === tipoId), [props.tipos, tipoId]);

  // Cascada departamento → municipio (via datalists)
  const [deptoNombre, setDeptoNombre] = useState('');
  const [municipioNombre, setMunicipioNombre] = useState('');
  const depto = useMemo(
    () => props.departamentos.find((d) => d.nombre === deptoNombre),
    [props.departamentos, deptoNombre],
  );
  const municipio = useMemo(
    () => depto?.municipios.find((m) => m.nombre === municipioNombre),
    [depto, municipioNombre],
  );

  // Cuentas de cobro filtradas por sucursal de la empresa
  const cuentasFiltered = useMemo(() => {
    if (!empresa?.sucursalId) return props.cuentasCobro;
    return props.cuentasCobro.filter((c) => c.sucursalId === empresa.sucursalId);
  }, [empresa, props.cuentasCobro]);

  // Niveles permitidos (si la empresa declaró; si no, todos)
  const nivelesPermitidos = useMemo(() => {
    if (!empresa || empresa.niveles.length === 0) return NIVELES;
    return NIVELES.filter((n) => empresa.niveles.includes(n));
  }, [empresa]);

  // Tipos permitidos
  const tiposPermitidos = useMemo(() => {
    if (!empresa || empresa.tiposIds.length === 0) return props.tipos;
    return props.tipos.filter((t) => empresa.tiposIds.includes(t.id));
  }, [empresa, props.tipos]);

  // Subtipos permitidos (si la empresa restringe)
  const subtiposVisibles = useMemo(() => {
    if (!tipo) return [];
    if (!empresa || empresa.subtiposIds.length === 0) return tipo.subtipos;
    return tipo.subtipos.filter((s) => empresa.subtiposIds.includes(s.id));
  }, [tipo, empresa]);

  // Éxito → llamar onSuccess (para cerrar modal)
  useEffect(() => {
    if (state.ok) props.onSuccess?.();
  }, [state.ok, props]);

  return (
    <form action={action} className="space-y-4">
      {/* Identificación */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Identificación del cotizante</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="tipoDocumento">Tipo doc.</Label>
            <select
              id="tipoDocumento"
              name="tipoDocumento"
              required
              defaultValue="CC"
              className={selectClass}
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="TI">TI</option>
              <option value="RC">RC</option>
              <option value="PAS">PAS</option>
              <option value="NIP">NIP</option>
            </select>
          </div>
          <div>
            <Label htmlFor="numeroDocumento">Número</Label>
            <Input id="numeroDocumento" name="numeroDocumento" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="fechaExpedicionDoc">Fecha expedición</Label>
            <Input
              id="fechaExpedicionDoc"
              name="fechaExpedicionDoc"
              type="date"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="fechaNacimiento">Fecha nacimiento</Label>
            <Input
              id="fechaNacimiento"
              name="fechaNacimiento"
              type="date"
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="primerNombre">Primer nombre</Label>
            <Input id="primerNombre" name="primerNombre" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="segundoNombre">Segundo nombre</Label>
            <Input id="segundoNombre" name="segundoNombre" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="primerApellido">Primer apellido</Label>
            <Input id="primerApellido" name="primerApellido" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="segundoApellido">Segundo apellido</Label>
            <Input id="segundoApellido" name="segundoApellido" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="genero">Género</Label>
            <select id="genero" name="genero" required defaultValue="M" className={selectClass}>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Contacto</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" name="telefono" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="celular">Celular</Label>
            <Input id="celular" name="celular" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" name="direccion" className="mt-1" />
          </div>

          {/* Departamento + Municipio con datalist (filtro por texto) */}
          <div>
            <Label htmlFor="departamentoNombre">Departamento</Label>
            <input
              id="departamentoNombre"
              list="depto-list"
              value={deptoNombre}
              onChange={(e) => {
                setDeptoNombre(e.target.value);
                setMunicipioNombre(''); // reset municipio
              }}
              placeholder="Escribe o selecciona..."
              className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
            />
            <datalist id="depto-list">
              {props.departamentos.map((d) => (
                <option key={d.id} value={d.nombre} />
              ))}
            </datalist>
            <input type="hidden" name="departamentoId" value={depto?.id ?? ''} />
          </div>
          <div>
            <Label htmlFor="municipioNombre">Municipio</Label>
            <input
              id="municipioNombre"
              list="muni-list"
              value={municipioNombre}
              onChange={(e) => setMunicipioNombre(e.target.value)}
              disabled={!depto}
              placeholder={depto ? 'Escribe o selecciona...' : 'Primero elige depto'}
              className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm disabled:opacity-50"
            />
            <datalist id="muni-list">
              {depto?.municipios.map((m) => <option key={m.id} value={m.nombre} />)}
            </datalist>
            <input type="hidden" name="municipioId" value={municipio?.id ?? ''} />
          </div>
        </div>
      </section>

      {/* Afiliación */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Afiliación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="empresaId">Empresa planilla</Label>
            <select
              id="empresaId"
              name="empresaId"
              required
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setTipoId(''); // reset tipo
              }}
              className={selectClass}
            >
              <option value="">— Seleccionar —</option>
              {props.empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nit} — {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cuentaCobroId">Empresa CC (opcional)</Label>
            <select
              id="cuentaCobroId"
              name="cuentaCobroId"
              defaultValue=""
              disabled={!empresa}
              className={selectClass}
            >
              <option value="">— Ninguna —</option>
              {cuentasFiltered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.razonSocial}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="tipoCotizanteId">Tipo cotizante</Label>
            <select
              id="tipoCotizanteId"
              name="tipoCotizanteId"
              required
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              className={selectClass}
            >
              <option value="">—</option>
              {tiposPermitidos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="subtipoId">Subtipo</Label>
            <select
              id="subtipoId"
              name="subtipoId"
              disabled={!tipo || subtiposVisibles.length === 0}
              defaultValue=""
              className={selectClass}
            >
              <option value="">— Ninguno —</option>
              {subtiposVisibles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="nivelRiesgo">Nivel riesgo ARL</Label>
            <select
              id="nivelRiesgo"
              name="nivelRiesgo"
              required
              defaultValue={nivelesPermitidos[0] ?? 'I'}
              className={selectClass}
            >
              {nivelesPermitidos.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {empresa && empresa.niveles.length > 0 && (
              <p className="mt-1 text-[10px] text-slate-400">
                Solo niveles permitidos de la empresa
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="fechaIngreso">Fecha de ingreso</Label>
            <Input
              id="fechaIngreso"
              name="fechaIngreso"
              type="date"
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="salario">Salario (COP)</Label>
            <Input
              id="salario"
              name="salario"
              type="number"
              step="1"
              min={props.smlv}
              required
              defaultValue={props.smlv}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Mínimo SMLV: {copFmt.format(props.smlv)}
            </p>
          </div>
          <div>
            <Label htmlFor="valorAdministracion">Valor administración (opcional)</Label>
            <Input
              id="valorAdministracion"
              name="valorAdministracion"
              type="number"
              step="1"
              min="0"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="asesorComercialId">Asesor comercial</Label>
            <select
              id="asesorComercialId"
              name="asesorComercialId"
              defaultValue=""
              className={selectClass}
            >
              <option value="">— Ninguno —</option>
              {props.asesores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Entidades SGSS */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Entidades SGSS</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="epsId">EPS</Label>
            <select id="epsId" name="epsId" defaultValue="" className={selectClass}>
              <option value="">— Ninguna —</option>
              {props.eps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} — {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="afpId">AFP</Label>
            <select id="afpId" name="afpId" defaultValue="" className={selectClass}>
              <option value="">— Ninguna —</option>
              {props.afp.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ccfId">Caja Compensación</Label>
            <select id="ccfId" name="ccfId" defaultValue="" className={selectClass}>
              <option value="">— Ninguna —</option>
              {props.ccf.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Servicios adicionales */}
      {props.servicios.length > 0 && (
        <section className={sectionCls}>
          <h3 className={sectionTitle}>Servicios adicionales (opcional)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {props.servicios.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="servicioId"
                  value={s.id}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <div className="flex-1">
                  <p className="font-medium">
                    <span className="font-mono text-xs text-slate-500">{s.codigo}</span>{' '}
                    {s.nombre}
                  </p>
                  <p className="text-[11px] text-slate-500">{copFmt.format(s.precio)}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Comentarios */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Comentarios / observaciones</h3>
        <textarea
          id="comentarios"
          name="comentarios"
          rows={3}
          maxLength={1000}
          placeholder="Notas internas sobre esta afiliación"
          className="w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text-primary focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15"
        />
      </section>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Guardando…' : 'Crear afiliación'}
        </Button>
      </div>
    </form>
  );
}
