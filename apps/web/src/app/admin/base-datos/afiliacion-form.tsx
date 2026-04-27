'use client';

import { useActionState, useState, useMemo, useEffect, useTransition } from 'react';
import { Save, AlertCircle, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createAfiliacionAction, updateAfiliacionAction, type ActionState } from './actions';
import { consultarBduaRuafAction } from './consulta-bdua-ruaf-action';

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
  /** Régimen al que aplica: 'ORDINARIO' | 'RESOLUCION' | 'AMBOS'. */
  regimen: 'ORDINARIO' | 'RESOLUCION' | 'AMBOS';
};

export type EntidadOpt = {
  id: string;
  codigo: string;
  nombre: string;
  /** Código oficial PILA / MinSalud — el que devuelve BDUA/RUAF.
   * Es el campo correcto para hacer matching con respuestas del operador. */
  codigoMinSalud: string | null;
};
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
  // Sprint 8.0.5 — Bot Colpatria
  cargo: string | null;
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

  const [state, action, pending] = useActionState<ActionState, FormData>(boundAction, {});

  // === Identificación (controlada) — necesaria para autocompletar BDUA/RUAF ===
  const [tipoDocumento, setTipoDocumento] = useState<string>('CC');
  const [numeroDocumento, setNumeroDocumento] = useState<string>('');
  const [primerNombre, setPrimerNombre] = useState<string>('');
  const [segundoNombre, setSegundoNombre] = useState<string>('');
  const [primerApellido, setPrimerApellido] = useState<string>('');
  const [segundoApellido, setSegundoApellido] = useState<string>('');

  // EPS/AFP controladas para poder autollenar
  const [epsIdState, setEpsIdState] = useState<string>(initial?.epsId ?? '');
  const [afpIdState, setAfpIdState] = useState<string>(initial?.afpId ?? '');

  // BDUA/RUAF feedback
  const [bduaPending, startBduaTransition] = useTransition();
  const [bduaResult, setBduaResult] = useState<
    | null
    | {
        kind: 'ok';
        nombres: boolean;
        eps: string | null;
        afp: string | null;
        epsMiss: string | null;
        afpMiss: string | null;
        isPensionary?: 'SI' | 'NO';
      }
    | { kind: 'empty' }
    | { kind: 'error'; message: string }
  >(null);

  const handleConsultarBduaRuaf = () => {
    if (!numeroDocumento || numeroDocumento.length < 4) return;
    setBduaResult(null);
    startBduaTransition(async () => {
      const res = await consultarBduaRuafAction(tipoDocumento, numeroDocumento);
      if (!res.ok) {
        setBduaResult({ kind: 'error', message: res.error });
        return;
      }
      if (!res.item) {
        setBduaResult({ kind: 'empty' });
        return;
      }
      const i = res.item;
      // Nombres (solo si los campos están vacíos — no pisar lo que el usuario
      // ya tecleó manualmente).
      let nombresRellenados = false;
      if (!primerNombre && i.first_name) {
        setPrimerNombre(i.first_name);
        nombresRellenados = true;
      }
      if (!segundoNombre && i.second_name) {
        setSegundoNombre(i.second_name);
        nombresRellenados = true;
      }
      if (!primerApellido && i.first_last_name) {
        setPrimerApellido(i.first_last_name);
        nombresRellenados = true;
      }
      if (!segundoApellido && i.second_last_name) {
        setSegundoApellido(i.second_last_name);
        nombresRellenados = true;
      }

      // EPS → buscar por Cód. MinSalud (es el código que devuelve BDUA,
      // no nuestro código interno EPS-XXXX).
      let epsMatch: string | null = null;
      let epsMiss: string | null = null;
      if (i.bdua_eps_code) {
        const hit = props.eps.find((e) => e.codigoMinSalud === i.bdua_eps_code);
        if (hit) {
          setEpsIdState(hit.id);
          epsMatch = hit.nombre;
        } else {
          epsMiss = i.bdua_eps_code;
        }
      }

      // AFP → mismo patrón con codigoMinSalud
      let afpMatch: string | null = null;
      let afpMiss: string | null = null;
      if (i.ruaf_afp_code) {
        const hit = props.afp.find((a) => a.codigoMinSalud === i.ruaf_afp_code);
        if (hit) {
          setAfpIdState(hit.id);
          afpMatch = hit.nombre;
        } else {
          afpMiss = i.ruaf_afp_code;
        }
      }

      setBduaResult({
        kind: 'ok',
        nombres: nombresRellenados,
        eps: epsMatch,
        afp: afpMatch,
        epsMiss,
        afpMiss,
        isPensionary: i.is_pensionary,
      });
    });
  };

  // === Cascadas ===

  // Tipos filtrados por modalidad
  const tiposPorModalidad = useMemo(
    () => props.tipos.filter((t) => t.modalidad === modalidad),
    [props.tipos, modalidad],
  );

  // Régimen seleccionado (solo aplica a dependientes; independiente no tiene
  // régimen, por eso para ellos filtramos contra 'ORDINARIO' por default).
  const [regimenActual, setRegimenActual] = useState<string>(initial?.regimen ?? 'ORDINARIO');

  // Planes visibles según régimen del cotizante/afiliación:
  //   - regimen del plan = AMBOS → siempre visible
  //   - regimen del plan = ORDINARIO → visible si régimen actual ORDINARIO
  //   - regimen del plan = RESOLUCION → visible si régimen actual RESOLUCION
  const planesFiltrados = useMemo(() => {
    const target = regimenActual || 'ORDINARIO';
    return props.planes.filter((p) => p.regimen === 'AMBOS' || p.regimen === target);
  }, [props.planes, regimenActual]);

  // Plan → requiereArl (necesario para decidir filtros aguas abajo)
  const [planId, setPlanId] = useState(initial?.planSgssId ?? '');
  const plan = useMemo(() => props.planes.find((p) => p.id === planId), [props.planes, planId]);

  // Si al cambiar de régimen el plan actual deja de ser compatible → reset
  useEffect(() => {
    if (planId && !planesFiltrados.some((p) => p.id === planId)) {
      setPlanId('');
    }
  }, [planId, planesFiltrados]);

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
      (e) => e.actividadesIds.includes(actividad.id) || e.ciiuPrincipal === actividad.codigoCiiu,
    );
  }, [requiereArl, actividad, props.empresas]);

  const [empresaId, setEmpresaId] = useState(initial?.empresaId ?? '');
  const empresa = useMemo(
    () => props.empresas.find((e) => e.id === empresaId),
    [props.empresas, empresaId],
  );

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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-slate-500">
                {props.cotizanteSnapshot.tipoDocumento} {props.cotizanteSnapshot.numeroDocumento}
              </p>
              <p className="font-medium text-slate-900">{props.cotizanteSnapshot.nombreCompleto}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                  modalidad === 'DEPENDIENTE'
                    ? 'bg-sky-50 text-sky-700 ring-sky-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                }`}
              >
                {modalidad === 'DEPENDIENTE' ? 'Dependiente' : 'Independiente'}
              </span>
              {modalidad === 'DEPENDIENTE' && regimenActual && (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                    regimenActual === 'ORDINARIO'
                      ? 'bg-sky-50 text-sky-700 ring-sky-200'
                      : 'bg-violet-50 text-violet-700 ring-violet-200'
                  }`}
                >
                  {regimenActual === 'ORDINARIO' ? 'Ordinario' : 'Resolución'}
                </span>
              )}
              {plan && (
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                  Plan: {plan.nombre}
                </span>
              )}
            </div>
          </div>
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
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
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
              <div className="sm:col-span-2">
                <Label htmlFor="numeroDocumento">
                  Número <Req />
                </Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="numeroDocumento"
                    name="numeroDocumento"
                    required
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleConsultarBduaRuaf}
                    disabled={bduaPending || numeroDocumento.length < 4}
                    title="Consulta EPS, AFP y nombres en BDUA/RUAF vía PagoSimple"
                  >
                    {bduaPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span>BDUA/RUAF</span>
                  </Button>
                </div>
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
                <Input
                  id="primerNombre"
                  name="primerNombre"
                  required
                  value={primerNombre}
                  onChange={(e) => setPrimerNombre(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="segundoNombre">Segundo nombre</Label>
                <Input
                  id="segundoNombre"
                  name="segundoNombre"
                  value={segundoNombre}
                  onChange={(e) => setSegundoNombre(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="primerApellido">
                  Primer apellido <Req />
                </Label>
                <Input
                  id="primerApellido"
                  name="primerApellido"
                  required
                  value={primerApellido}
                  onChange={(e) => setPrimerApellido(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="segundoApellido">Segundo apellido</Label>
                <Input
                  id="segundoApellido"
                  name="segundoApellido"
                  value={segundoApellido}
                  onChange={(e) => setSegundoApellido(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="genero">
                  Género <Req />
                </Label>
                <select id="genero" name="genero" required defaultValue="M" className={selectClass}>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select>
              </div>

              <div>
                <Label htmlFor="estadoCivil">Estado civil</Label>
                <select id="estadoCivil" name="estadoCivil" defaultValue="" className={selectClass}>
                  <option value="">— No especificado —</option>
                  <option value="1">Soltero(a)</option>
                  <option value="2">Casado(a)</option>
                  <option value="3">Unión Libre</option>
                  <option value="4">Separado(a)</option>
                  <option value="5">Viudo(a)</option>
                </select>
              </div>
            </div>

            {/* Banner de resultado BDUA/RUAF */}
            {bduaResult && (
              <div className="mt-3">
                {bduaResult.kind === 'ok' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="space-y-0.5">
                        <p className="font-medium">BDUA/RUAF · consulta OK</p>
                        <ul className="space-y-0.5">
                          {bduaResult.nombres && <li>✓ Nombres/apellidos completados</li>}
                          {bduaResult.eps && <li>✓ EPS: {bduaResult.eps}</li>}
                          {bduaResult.afp && <li>✓ AFP: {bduaResult.afp}</li>}
                          {bduaResult.epsMiss && (
                            <li className="text-amber-800">
                              ⚠ EPS código {bduaResult.epsMiss} no está en el catálogo local
                            </li>
                          )}
                          {bduaResult.afpMiss && (
                            <li className="text-amber-800">
                              ⚠ AFP código {bduaResult.afpMiss} no está en el catálogo local
                            </li>
                          )}
                          {bduaResult.isPensionary === 'SI' && (
                            <li className="text-violet-800">
                              ℹ Cotizante marcado como <strong>pensionado</strong> en RUAF
                            </li>
                          )}
                          {!bduaResult.nombres && !bduaResult.eps && !bduaResult.afp && (
                            <li className="text-slate-600">Sin datos nuevos para autollenar.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {bduaResult.kind === 'empty' && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div>
                        <p className="font-medium">Sin registros en BDUA/RUAF</p>
                        <p className="text-slate-500">
                          La persona no aparece afiliada al SGSS con ese documento. Continúa
                          llenando el formulario manualmente.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {bduaResult.kind === 'error' && (
                  <Alert variant="danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{bduaResult.message}</span>
                  </Alert>
                )}
              </div>
            )}
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
                  {depto?.municipios.map((m) => (
                    <option key={m.id} value={m.nombre} />
                  ))}
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
              {planesFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.regimen !== 'AMBOS' ? ` · ${p.regimen}` : ''}
                </option>
              ))}
            </select>
            {props.planes.length > planesFiltrados.length && (
              <p className="mt-1 text-[10px] text-slate-400">
                Se ocultaron {props.planes.length - planesFiltrados.length}{' '}
                {props.planes.length - planesFiltrados.length === 1 ? 'plan' : 'planes'} de otro
                régimen.
              </p>
            )}
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
                    Sin ARL — se oculta actividad económica y nivel de riesgo. Empresa planilla sin
                    filtro.
                  </p>
                )}
              </>
            )}
          </div>

          {/* 2) Régimen (solo DEPENDIENTE) o Forma de pago (solo
               INDEPENDIENTE). Los independientes siempre operan bajo
               régimen ORDINARIO — los planes de resolución NO aplican
               para ellos, por eso el selector queda oculto y el filtro
               de planes toma ORDINARIO por default. */}
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
                  value={regimenActual}
                  onChange={(e) => setRegimenActual(e.target.value)}
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
            <input type="hidden" name="nivelRiesgo" value={initial?.nivelRiesgo ?? 'I'} />
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

          <div>
            <Label htmlFor="cargo">Cargo</Label>
            <Input
              id="cargo"
              name="cargo"
              type="text"
              maxLength={100}
              defaultValue={initial?.cargo ?? ''}
              disabled={readOnly}
              placeholder="ej. Operario"
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Requerido por bot Colpatria si la empresa lo tiene activo
            </p>
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
              <Label htmlFor="epsId">EPS {plan?.incluyeEps && <Req />}</Label>
              <select
                id="epsId"
                name="epsId"
                value={epsIdState}
                onChange={(e) => setEpsIdState(e.target.value)}
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
              <Label htmlFor="afpId">AFP {plan?.incluyeAfp && <Req />}</Label>
              <select
                id="afpId"
                name="afpId"
                value={afpIdState}
                onChange={(e) => setAfpIdState(e.target.value)}
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
              <Label htmlFor="ccfId">Caja Compensación {plan?.incluyeCcf && <Req />}</Label>
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
              <Label htmlFor="arlId">ARL {plan?.incluyeArl && <Req />}</Label>
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
                    <span className="font-mono text-xs text-slate-500">{s.codigo}</span> {s.nombre}
                  </p>
                  <p className="text-[11px] text-slate-500">{copFmt.format(s.precio)}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Soportes (adjuntos que van a la bandeja Soporte · Afiliaciones) */}
      {!readOnly && (
        <section className={sectionCls}>
          <h3 className={sectionTitle}>Soportes adjuntos</h3>
          <p className="mb-2 text-[11px] text-slate-500">
            Opcional. PDF, JPG, PNG o WebP hasta 5 MB cada uno. Se enviarán a soporte junto con la
            solicitud generada automáticamente.
          </p>
          <input
            type="file"
            name="documento"
            multiple
            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
            className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
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
  return (
    <span className="text-red-600" aria-label="campo obligatorio">
      *
    </span>
  );
}
