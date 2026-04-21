'use client';

import { useActionState, useMemo, useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { updateAfiliacionAction, type ActionState } from '../actions';
import type {
  EmpresaOpt,
  TipoOpt,
  ActividadOpt,
  PlanOpt,
  EntidadOpt,
  CuentaCobroOpt,
  AsesorOpt,
  ServicioOpt,
} from '../nueva-afiliacion-form';

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base text-brand-text-primary sm:text-sm';

const sectionCls = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

const NIVELES = ['I', 'II', 'III', 'IV', 'V'] as const;

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export type InitialAfiliacion = {
  empresaId: string;
  cuentaCobroId: string | null;
  asesorComercialId: string | null;
  planSgssId: string | null;
  actividadEconomicaId: string | null;
  tipoCotizanteId: string;
  subtipoId: string | null;
  nivelRiesgo: string;
  regimen: string;
  estado: string;
  salario: number;
  valorAdministracion: number | null;
  fechaIngreso: string; // YYYY-MM-DD
  comentarios: string | null;
  epsId: string | null;
  afpId: string | null;
  ccfId: string | null;
  serviciosIds: string[];
};

export function EditAfiliacionForm({
  afiliacionId,
  initial,
  empresas,
  actividades,
  planes,
  tipos,
  eps,
  afp,
  ccf,
  cuentasCobro,
  asesores,
  servicios,
  smlv,
}: {
  afiliacionId: string;
  initial: InitialAfiliacion;
  empresas: EmpresaOpt[];
  actividades: ActividadOpt[];
  planes: PlanOpt[];
  tipos: TipoOpt[];
  eps: EntidadOpt[];
  afp: EntidadOpt[];
  ccf: EntidadOpt[];
  cuentasCobro: CuentaCobroOpt[];
  asesores: AsesorOpt[];
  servicios: ServicioOpt[];
  smlv: number;
}) {
  const bound = updateAfiliacionAction.bind(null, afiliacionId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  const [actividadId, setActividadId] = useState(initial.actividadEconomicaId ?? '');
  const [empresaId, setEmpresaId] = useState(initial.empresaId);
  const [tipoId, setTipoId] = useState(initial.tipoCotizanteId);
  const [planId, setPlanId] = useState(initial.planSgssId ?? '');

  const actividad = useMemo(
    () => actividades.find((a) => a.id === actividadId),
    [actividades, actividadId],
  );

  const empresasFiltered = useMemo(() => {
    if (!actividad) return empresas;
    return empresas.filter(
      (e) =>
        e.actividadesIds.includes(actividad.id) ||
        e.ciiuPrincipal === actividad.codigoCiiu,
    );
  }, [actividad, empresas]);

  const empresa = useMemo(() => empresas.find((e) => e.id === empresaId), [empresas, empresaId]);
  const tipo = useMemo(() => tipos.find((t) => t.id === tipoId), [tipos, tipoId]);
  const plan = useMemo(() => planes.find((p) => p.id === planId), [planes, planId]);

  const cuentasFiltered = useMemo(() => {
    if (!empresa?.sucursalId) return cuentasCobro;
    return cuentasCobro.filter((c) => c.sucursalId === empresa.sucursalId);
  }, [empresa, cuentasCobro]);

  const nivelesPermitidos = useMemo(() => {
    if (!empresa || empresa.niveles.length === 0) return NIVELES;
    return NIVELES.filter((n) => empresa.niveles.includes(n));
  }, [empresa]);

  const tiposPermitidos = useMemo(() => {
    if (!empresa || empresa.tiposIds.length === 0) return tipos;
    return tipos.filter((t) => empresa.tiposIds.includes(t.id));
  }, [empresa, tipos]);

  const subtiposVisibles = useMemo(() => {
    if (!tipo) return [];
    if (!empresa || empresa.subtiposIds.length === 0) return tipo.subtipos;
    return tipo.subtipos.filter((s) => empresa.subtiposIds.includes(s.id));
  }, [tipo, empresa]);

  const showEps = !plan || plan.incluyeEps;
  const showAfp = !plan || plan.incluyeAfp;
  const showCcf = !plan || plan.incluyeCcf;

  // Si cambia la actividad y la empresa ya no califica, limpiarla
  useEffect(() => {
    if (empresaId && !empresasFiltered.some((e) => e.id === empresaId)) {
      setEmpresaId('');
    }
  }, [empresasFiltered, empresaId]);

  const serviciosInitialSet = new Set(initial.serviciosIds);

  return (
    <form action={action} className="space-y-4">
      {/* Afiliación */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Afiliación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="actividadEconomicaId">Actividad económica</Label>
            <select
              id="actividadEconomicaId"
              name="actividadEconomicaId"
              value={actividadId}
              onChange={(e) => setActividadId(e.target.value)}
              className={selectClass}
            >
              <option value="">— Todas —</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigoCiiu} — {a.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="empresaId">Empresa planilla</Label>
            <select
              id="empresaId"
              name="empresaId"
              required
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
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

          <div className="sm:col-span-2">
            <Label htmlFor="cuentaCobroId">Empresa CC</Label>
            <select
              id="cuentaCobroId"
              name="cuentaCobroId"
              defaultValue={initial.cuentaCobroId ?? ''}
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
          <div className="sm:col-span-2">
            <Label htmlFor="planSgssId">Plan SGSS</Label>
            <select
              id="planSgssId"
              name="planSgssId"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className={selectClass}
            >
              <option value="">— Sin plan —</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
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
              defaultValue={initial.subtipoId ?? ''}
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
            <Label htmlFor="nivelRiesgo">Nivel riesgo</Label>
            <select
              id="nivelRiesgo"
              name="nivelRiesgo"
              required
              defaultValue={initial.nivelRiesgo}
              className={selectClass}
            >
              {nivelesPermitidos.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="regimen">Régimen</Label>
            <select
              id="regimen"
              name="regimen"
              required
              defaultValue={initial.regimen}
              className={selectClass}
            >
              <option value="ORDINARIO">Ordinario</option>
              <option value="RESOLUCION">Resolución</option>
            </select>
          </div>

          <div>
            <Label htmlFor="estado">Estado</Label>
            <select
              id="estado"
              name="estado"
              required
              defaultValue={initial.estado}
              className={selectClass}
            >
              <option value="ACTIVA">Activa</option>
              <option value="INACTIVA">Inactiva</option>
            </select>
          </div>
          <div>
            <Label htmlFor="fechaIngreso">Fecha ingreso</Label>
            <Input
              id="fechaIngreso"
              name="fechaIngreso"
              type="date"
              required
              defaultValue={initial.fechaIngreso}
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
              min={smlv}
              required
              defaultValue={initial.salario}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Mín. SMLV: {copFmt.format(smlv)}
            </p>
          </div>
          <div>
            <Label htmlFor="valorAdministracion">Valor administración</Label>
            <Input
              id="valorAdministracion"
              name="valorAdministracion"
              type="number"
              step="1"
              min="0"
              defaultValue={initial.valorAdministracion ?? ''}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-4">
            <Label htmlFor="asesorComercialId">Asesor comercial</Label>
            <select
              id="asesorComercialId"
              name="asesorComercialId"
              defaultValue={initial.asesorComercialId ?? ''}
              className={selectClass}
            >
              <option value="">— Ninguno —</option>
              {asesores.map((a) => (
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
              (según plan {plan.codigo})
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {showEps && (
            <div>
              <Label htmlFor="epsId">
                EPS {plan?.incluyeEps && <span className="text-red-600">*</span>}
              </Label>
              <select
                id="epsId"
                name="epsId"
                defaultValue={initial.epsId ?? ''}
                required={!!plan?.incluyeEps}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {eps.map((e) => (
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
                AFP {plan?.incluyeAfp && <span className="text-red-600">*</span>}
              </Label>
              <select
                id="afpId"
                name="afpId"
                defaultValue={initial.afpId ?? ''}
                required={!!plan?.incluyeAfp}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {afp.map((a) => (
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
                Caja {plan?.incluyeCcf && <span className="text-red-600">*</span>}
              </Label>
              <select
                id="ccfId"
                name="ccfId"
                defaultValue={initial.ccfId ?? ''}
                required={!!plan?.incluyeCcf}
                className={selectClass}
              >
                <option value="">— Ninguna —</option>
                {ccf.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Servicios adicionales */}
      {servicios.length > 0 && (
        <section className={sectionCls}>
          <h3 className={sectionTitle}>Servicios adicionales</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servicios.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="servicioId"
                  value={s.id}
                  defaultChecked={serviciosInitialSet.has(s.id)}
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
          defaultValue={initial.comentarios ?? ''}
          className="w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-text-primary focus-visible:border-brand-blue focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue/15"
        />
      </section>

      {state.error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && <Alert variant="success">Afiliación actualizada</Alert>}

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
