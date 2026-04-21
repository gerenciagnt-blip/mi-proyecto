'use client';

import { useActionState, useState, useMemo, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  createAfiliacionAction,
  updateAfiliacionAction,
  type ActionState,
} from './actions';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base text-brand-text-primary sm:text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600';

const sectionCls = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

const NIVELES = ['I', 'II', 'III', 'IV', 'V'] as const;

export type Modalidad = 'DEPENDIENTE' | 'INDEPENDIENTE';
export type Mode = 'create' | 'edit' | 'view';

export type EmpresaOpt = {
  id: string;
  nit: string;
  nombre: string;
  ciiuPrincipal: string | null;
  sucursalId: string | null;
  niveles: string[];
  tiposIds: string[];
  subtiposIds: string[];
  actividadesIds: string[];
};

export type TipoOpt = {
  id: string;
  codigo: string;
  nombre: string;
  modalidad: Modalidad;
  subtipos: { id: string; codigo: string; nombre: string }[];
};

export type DeptoOpt = {
  id: string;
  nombre: string;
  municipios: { id: string; nombre: string }[];
};

export type ActividadOpt = { id: string; codigoCiiu: string; descripcion: string };

export type PlanOpt = {
  id: string;
  codigo: string;
  nombre: string;
  incluyeEps: boolean;
  incluyeAfp: boolean;
  incluyeArl: boolean;
  incluyeCcf: boolean;
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

export type CotizanteSnapshot = {
  tipoDocumento: string;
  numeroDocumento: string;
  nombreCompleto: string;
};

export type InitialAfiliacion = {
  modalidad: Modalidad;
  empresaId: string | null;
  cuentaCobroId: string | null;
  asesorComercialId: string | null;
  planSgssId: string | null;
  actividadEconomicaId: string | null;
  tipoCotizanteId: string;
  subtipoId: string | null;
  nivelRiesgo: string;
  regimen: string | null;
  formaPago: string | null;
  estado: string;
  salario: number;
  valorAdministracion: number;
  fechaIngreso: string; // yyyy-mm-dd
  comentarios: string | null;
  epsId: string | null;
  afpId: string | null;
  arlId: string | null;
  ccfId: string | null;
  serviciosIds: string[];
};

export type AfiliacionFormProps = {
  mode: Mode;
  modalidad: Modalidad;
  afiliacionId?: string; // requerido en edit
  initial?: InitialAfiliacion; // requerido en edit/view
  cotizanteSnapshot?: CotizanteSnapshot; // solo para mostrar encabezado en edit/view

  empresas: EmpresaOpt[];
  tipos: TipoOpt[];
  departamentos: DeptoOpt[];
  actividades: ActividadOpt[];
  planes: PlanOpt[];
  eps: EntidadOpt[];
  afp: EntidadOpt[];
  arl: EntidadOpt[];
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

export function AfiliacionForm(props: AfiliacionFormProps) {
  const { mode, modalidad, initial } = props;
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';
  const isCreate = mode === 'create';
  const isIndep = modalidad === 'INDEPENDIENTE';

  // Acción según modo. Edit y create usan distintas signatures.
  const boundAction = useMemo(() => {
    if (mode === 'edit') {
      if (!props.afiliacionId) throw new Error('afiliacionId requerido en modo edit');
      return updateAfiliacionAction.bind(null, props.afiliacionId);
    }
    return createAfiliacionAction;
  }, [mode, props.afiliacionId]);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    boundAction,
    {},
  );

  // === Cascadas ===

  // Tipos filtrados por modalidad
  const tiposPorModalidad = useMemo(
    () => props.tipos.filter((t) => t.modalidad === modalidad),
    [props.tipos, modalidad],
  );

  // Plan → requiereArl (necesario para decidir filtros aguas abajo)
  const [planId, setPlanId] = useState(initial?.planSgssId ?? '');
  const plan = useMemo(
    () => props.planes.find((p) => p.id === planId),
    [props.planes, planId],
  );
  // Si el plan no incluye ARL, el nivel de riesgo y la actividad económica
  // dejan de aplicar, y la lista de empresas planilla no se filtra.
  const requiereArl = !plan || plan.incluyeArl;

  // Actividad económica
  const [actividadId, setActividadId] = useState(initial?.actividadEconomicaId ?? '');
  const actividad = useMemo(
    () => props.actividades.find((a) => a.id === actividadId),
    [props.actividades, actividadId],
  );

  // Empresas filtradas por actividad (sólo si el plan requiere ARL).
  // Cuando el plan no incluye ARL, el listado queda sin restricción.
  const empresasFiltered = useMemo(() => {
    if (!requiereArl) return props.empresas;
    if (!actividad) return props.empresas;
    return props.empresas.filter(
      (e) =>
        e.actividadesIds.includes(actividad.id) ||
        e.ciiuPrincipal === actividad.codigoCiiu,
    );
  }, [requiereArl, actividad, props.empresas]);

  const [empresaId, setEmpresaId] = useState(initial?.empresaId ?? '');
  const empresa = useMemo(() => props.empresas.find((e) => e.id === empresaId), [
    props.empresas,
    empresaId,
  ]);

  useEffect(() => {
    if (empresaId && !empresasFiltered.some((e) => e.id === empresaId)) {
      setEmpresaId('');
    }
  }, [empresasFiltered, empresaId]);

  // Tipo / subtipo
  const [tipoId, setTipoId] = useState(initial?.tipoCotizanteId ?? '');
  const tipo = useMemo(
    () => tiposPorModalidad.find((t) => t.id === tipoId),
    [tiposPorModalidad, tipoId],
  );

  // Si al cambiar modalidad el tipo previo no está permitido, limpiar
  useEffect(() => {
    if (tipoId && !tiposPorModalidad.some((t) => t.id === tipoId)) {
      setTipoId('');
    }
  }, [tiposPorModalidad, tipoId]);

  // (`planId`, `plan` y `requiereArl` ya declarados arriba)

  // Dirección (solo en create)
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

  // Niveles permitidos por empresa
  const nivelesPermitidos = useMemo(() => {
    if (!empresa || empresa.niveles.length === 0) return NIVELES;
    return NIVELES.filter((n) => empresa.niveles.includes(n));
  }, [empresa]);

  // Tipos permitidos por empresa (intersectar con tipos por modalidad)
  const tiposPermitidos = useMemo(() => {
    if (!empresa || empresa.tiposIds.length === 0) return tiposPorModalidad;
    return tiposPorModalidad.filter((t) => empresa.tiposIds.includes(t.id));
  }, [empresa, tiposPorModalidad]);

  const subtiposVisibles = useMemo(() => {
    if (!tipo) return [];
    if (!empresa || empresa.subtiposIds.length === 0) return tipo.subtipos;
    return tipo.subtipos.filter((s) => empresa.subtiposIds.includes(s.id));
  }, [tipo, empresa]);

  // Entidades visibles según plan
  const showEps = !plan || plan.incluyeEps;
  const showAfp = !plan || plan.incluyeAfp;
  const showCcf = !plan || plan.incluyeCcf;

  // Servicios iniciales (para edit/view)
  const serviciosInicialesSet = useMemo(
    () => new Set(initial?.serviciosIds ?? []),
    [initial?.serviciosIds],
  );

  useEffect(() => {
    if (state.ok) props.onSuccess?.();
  }, [state.ok, props]);

  return (
    <form action={readOnly ? undefined : action} className="space-y-4">
      {/* Discriminador de modalidad (oculto) */}
      <input type="hidden" name="modalidad" value={modalidad} />

      {/* Encabezado en edit/view */}
      {!isCreate && props.cotizanteSnapshot && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-mono text-xs text-slate-500">
            {props.cotizanteSnapshot.tipoDocumento}{' '}
            {props.cotizanteSnapshot.numeroDocumento}
          </p>
          <p className="font-medium text-slate-900">
            {props.cotizanteSnapshot.nombreCompleto}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
            Modalidad · {modalidad.toLowerCase()}
          </p>
        </div>
      )}

      {/* Identificación del cotizante (solo en CREATE) */}
      {isCreate && (
        <>
          <section className={sectionCls}>
            <h3 className={sectionTitle}>
              Identificación del cotizante
              <span className="ml-2 text-[11px] font-normal uppercase tracking-wider text-brand-blue">
                · {modalidad.toLowerCase()}
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="tipoDocumento">
                  Tipo doc. <Req />
                </Label>
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
                <Label htmlFor="numeroDocumento">
                  Número <Req />
                </Label>
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
                <Label htmlFor="fechaNacimiento">
                  Fecha nacimiento <Req />
                </Label>
                <Input
                  id="fechaNacimiento"
                  name="fechaNacimiento"
                  type="date"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="primerNombre">
                  Primer nombre <Req />
                </Label>
                <Input id="primerNombre" name="primerNombre" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="segundoNombre">Segundo nombre</Label>
                <Input id="segundoNombre" name="segundoNombre" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="primerApellido">
                  Primer apellido <Req />
                </Label>
                <Input id="primerApellido" name="primerApellido" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="segundoApellido">Segundo apellido</Label>
                <Input id="segundoApellido" name="segundoApellido" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="genero">
                  Género <Req />
                </Label>
                <select
                  id="genero"
                  name="genero"
                  required
                  defaultValue="M"
                  className={selectClass}
                >
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
              <div>
                <Label htmlFor="departamentoNombre">Departamento</Label>
                <input
                  id="departamentoNombre"
                  list="depto-list"
                  value={deptoNombre}
                  onChange={(e) => {
                    setDeptoNombre(e.target.value);
                    setMunicipioNombre('');
                  }}
                  placeholder="Escribe o selecciona..."
                  className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
                />
                <datalist id="depto-list">
                  {props.departamentos.map((d) => <option key={d.id} value={d.nombre} />)}
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
        </>
      )}

      {/* Afiliación */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Afiliación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {/* 1) Plan SGSS */}
          <div className="sm:col-span-2">
            <Label htmlFor="planSgssId">Plan SGSS</Label>
            <select
              id="planSgssId"
              name="planSgssId"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={readOnly}
              className={selectClass}
            >
              <option value="">— Sin plan (todas las entidades visibles) —</option>
              {props.planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {plan && (
              <>
                <p className="mt-1 text-[10px] text-slate-400">
                  Incluye:{' '}
                  {[
                    plan.incluyeEps && 'EPS',
                    plan.incluyeAfp && 'AFP',
                    plan.incluyeArl && 'ARL',
                    plan.incluyeCcf && 'CCF',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {!plan.incluyeArl && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    Sin ARL — se oculta actividad económica y nivel de riesgo.
                    Empresa planilla sin filtro.
                  </p>
                )}
              </>
            )}
          </div>

          {/* 2) Régimen (DEPENDIENTE) o Forma de pago (INDEPENDIENTE) */}
          {!isIndep ? (
            <>
              <div>
                <Label htmlFor="regimen">
                  Régimen <Req />
                </Label>
                <select
                  id="regimen"
                  name="regimen"
                  required
                  defaultValue={initial?.regimen ?? 'ORDINARIO'}
                  disabled={readOnly}
                  className={selectClass}
                >
                  <option value="ORDINARIO">Ordinario</option>
                  <option value="RESOLUCION">Resolución</option>
                </select>
              </div>
              <input type="hidden" name="formaPago" value="" />
            </>
          ) : (
            <>
              <input type="hidden" name="regimen" value="" />
              <div>
                <Label htmlFor="formaPago">
                  Forma de pago <Req />
                </Label>
                <select
                  id="formaPago"
                  name="formaPago"
                  required
                  defaultValue={initial?.formaPago ?? 'VIGENTE'}
                  disabled={readOnly}
                  className={selectClass}
                >
                  <option value="VIGENTE">Vigente (paga mes en curso)</option>
                  <option value="VENCIDO">Vencido (paga mes anterior)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="estado">
              Estado <Req />
            </Label>
            <select
              id="estado"
              name="estado"
              required
              defaultValue={initial?.estado ?? 'ACTIVA'}
              disabled={readOnly}
              className={selectClass}
            >
              <option value="ACTIVA">Activa</option>
              <option value="INACTIVA">Inactiva</option>
            </select>
          </div>

          {/* Actividad económica — oculta cuando el plan no incluye ARL */}
          {requiereArl ? (
            <div className="sm:col-span-2">
              <Label htmlFor="actividadEconomicaId">Actividad económica (CIIU)</Label>
              <select
                id="actividadEconomicaId"
                name="actividadEconomicaId"
                value={actividadId}
                onChange={(e) => setActividadId(e.target.value)}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Todas —</option>
                {props.actividades.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigoCiiu} — {a.descripcion}
                  </option>
                ))}
              </select>
              {actividad && isCreate && !isIndep && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Filtra empresas que tienen esta actividad permitida
                </p>
              )}
            </div>
          ) : (
            <input type="hidden" name="actividadEconomicaId" value="" />
          )}

          {/* Empresa planilla — sólo DEPENDIENTE */}
          {!isIndep ? (
            <div className="sm:col-span-2">
              <Label htmlFor="empresaId">
                Empresa planilla <Req />
              </Label>
              <select
                id="empresaId"
                name="empresaId"
                required
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  setTipoId('');
                }}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Seleccionar —</option>
                {empresasFiltered.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nit} — {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="empresaId" value="" />
          )}

          {/* Empresa CC — libre (ambas modalidades) */}
          <div className="sm:col-span-2">
            <Label htmlFor="cuentaCobroId">Empresa CC (opcional)</Label>
            <select
              id="cuentaCobroId"
              name="cuentaCobroId"
              defaultValue={initial?.cuentaCobroId ?? ''}
              disabled={readOnly}
              className={selectClass}
            >
              <option value="">— Ninguna —</option>
              {props.cuentasCobro.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.razonSocial}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-400">
              Elección libre — no se vincula a la empresa planilla
            </p>
          </div>

          {/* Tipo / subtipo / nivel */}
          <div>
            <Label htmlFor="tipoCotizanteId">
              Tipo cotizante <Req />
            </Label>
            <select
              id="tipoCotizanteId"
              name="tipoCotizanteId"
              required
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              disabled={readOnly}
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
              disabled={readOnly || !tipo || subtiposVisibles.length === 0}
              defaultValue={initial?.subtipoId ?? ''}
              key={tipoId + (initial?.subtipoId ?? '')}
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
          {/* Nivel de riesgo ARL — oculto cuando el plan no incluye ARL */}
          {requiereArl ? (
            <div>
              <Label htmlFor="nivelRiesgo">
                Nivel riesgo ARL <Req />
              </Label>
              <select
                id="nivelRiesgo"
                name="nivelRiesgo"
                required
                defaultValue={initial?.nivelRiesgo ?? nivelesPermitidos[0] ?? 'I'}
                key={empresaId + (initial?.nivelRiesgo ?? '')}
                disabled={readOnly}
                className={selectClass}
              >
                {nivelesPermitidos.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            // El nivel sigue siendo obligatorio en BD. Cuando el plan no
            // incluye ARL se envía el valor previo o 'I' como mínimo.
            <input
              type="hidden"
              name="nivelRiesgo"
              value={initial?.nivelRiesgo ?? 'I'}
            />
          )}

          <div>
            <Label htmlFor="fechaIngreso">
              Fecha de ingreso <Req />
            </Label>
            <Input
              id="fechaIngreso"
              name="fechaIngreso"
              type="date"
              required
              defaultValue={initial?.fechaIngreso ?? ''}
              disabled={readOnly}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="salario">
              Salario (COP) <Req />
            </Label>
            <Input
              id="salario"
              name="salario"
              type="number"
              step="1"
              min={props.smlv}
              required
              defaultValue={initial?.salario ?? props.smlv}
              disabled={readOnly}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Mínimo SMLV: {copFmt.format(props.smlv)}
            </p>
          </div>

          <div>
            <Label htmlFor="valorAdministracion">
              Valor administración <Req />
            </Label>
            <Input
              id="valorAdministracion"
              name="valorAdministracion"
              type="number"
              step="1"
              min="0"
              required
              defaultValue={initial?.valorAdministracion ?? ''}
              disabled={readOnly}
              className="mt-1"
            />
          </div>

          {/* Asesor comercial (reducido) */}
          <div>
            <Label htmlFor="asesorComercialId">Asesor comercial</Label>
            <select
              id="asesorComercialId"
              name="asesorComercialId"
              defaultValue={initial?.asesorComercialId ?? ''}
              disabled={readOnly}
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
        <h3 className={sectionTitle}>
          Entidades SGSS{' '}
          {plan && (
            <span className="ml-1 text-xs font-normal text-slate-500">
              (según plan {plan.nombre})
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {showEps && (
            <div>
              <Label htmlFor="epsId">
                EPS {plan?.incluyeEps && <Req />}
              </Label>
              <select
                id="epsId"
                name="epsId"
                defaultValue={initial?.epsId ?? ''}
                required={!!plan?.incluyeEps}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {props.eps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo} — {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {showAfp && (
            <div>
              <Label htmlFor="afpId">
                AFP {plan?.incluyeAfp && <Req />}
              </Label>
              <select
                id="afpId"
                name="afpId"
                defaultValue={initial?.afpId ?? ''}
                required={!!plan?.incluyeAfp}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {props.afp.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {showCcf && (
            <div>
              <Label htmlFor="ccfId">
                Caja Compensación {plan?.incluyeCcf && <Req />}
              </Label>
              <select
                id="ccfId"
                name="ccfId"
                defaultValue={initial?.ccfId ?? ''}
                required={!!plan?.incluyeCcf}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {props.ccf.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* ARL — sólo para INDEPENDIENTE */}
          {isIndep && (
            <div>
              <Label htmlFor="arlId">
                ARL {plan?.incluyeArl && <Req />}
              </Label>
              <select
                id="arlId"
                name="arlId"
                defaultValue={initial?.arlId ?? ''}
                required={!!plan?.incluyeArl}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {props.arl.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {plan?.incluyeArl && !isIndep && (
          <p className="mt-3 text-xs text-slate-500">
            <strong>ARL:</strong> se toma de la ARL configurada en la empresa planilla seleccionada.
          </p>
        )}
      </section>

      {/* Servicios adicionales */}
      {props.servicios.length > 0 && (
        <section className={sectionCls}>
          <h3 className={sectionTitle}>Servicios adicionales (opcional)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {props.servicios.map((s) => (
              <label
                key={s.id}
                className={`flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm ${
                  readOnly ? 'cursor-default bg-slate-50' : 'cursor-pointer hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  name="servicioId"
                  value={s.id}
                  defaultChecked={serviciosInicialesSet.has(s.id)}
                  disabled={readOnly}
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
          defaultValue={initial?.comentarios ?? ''}
          disabled={readOnly}
          placeholder="Notas internas sobre esta afiliación"
          className="w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text-primary focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15 disabled:bg-slate-50 disabled:text-slate-600"
        />
      </section>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" variant="gradient" size="lg" disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear afiliación'}
          </Button>
        </div>
      )}
    </form>
  );
}

function Req() {
  return <span className="text-red-600" aria-label="campo obligatorio">*</span>;
}
