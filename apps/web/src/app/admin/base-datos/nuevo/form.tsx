'use client';

import { useActionState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { createAfiliacionAction, type ActionState } from './actions';

type Option = { id: string; label: string };
type EmpresaOpt = { id: string; nit: string; nombre: string; sucursalId: string | null };
type TipoCotOpt = { id: string; codigo: string; nombre: string };

const selectClass =
  'mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base text-brand-text-primary sm:text-sm';

const sectionCls = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitle = 'mb-3 text-sm font-semibold';

export function NuevaAfiliacionForm({
  empresas,
  cuentasCobro,
  asesores,
  tiposCotizante,
}: {
  empresas: EmpresaOpt[];
  cuentasCobro: { id: string; codigo: string; razonSocial: string; sucursalId: string }[];
  asesores: Option[];
  tiposCotizante: TipoCotOpt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAfiliacionAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {/* Cotizante — Identificación */}
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
            <Label htmlFor="genero">Género</Label>
            <select id="genero" name="genero" required defaultValue="M" className={selectClass}>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
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
        </div>
      </section>

      {/* Cotizante — Contacto */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Contacto (opcional)</h3>
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
            <Label htmlFor="ciudad">Ciudad</Label>
            <Input id="ciudad" name="ciudad" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="departamento">Departamento</Label>
            <Input id="departamento" name="departamento" className="mt-1" />
          </div>
        </div>
      </section>

      {/* Afiliación */}
      <section className={sectionCls}>
        <h3 className={sectionTitle}>Afiliación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="empresaId">Empresa planilla</Label>
            <select id="empresaId" name="empresaId" required defaultValue="" className={selectClass}>
              <option value="">— Seleccionar —</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nit} — {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cuentaCobroId">Empresa CC (opcional)</Label>
            <select id="cuentaCobroId" name="cuentaCobroId" defaultValue="" className={selectClass}>
              <option value="">— Ninguna —</option>
              {cuentasCobro.map((c) => (
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
              defaultValue=""
              className={selectClass}
            >
              <option value="">—</option>
              {tiposCotizante.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="subtipoId">Subtipo (opcional)</Label>
            <Input
              id="subtipoId"
              name="subtipoId"
              placeholder="ID del subtipo"
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              (Cascada de subtipos por tipo: Fase 2.2)
            </p>
          </div>
          <div>
            <Label htmlFor="nivelRiesgo">Nivel riesgo ARL</Label>
            <select
              id="nivelRiesgo"
              name="nivelRiesgo"
              required
              defaultValue="I"
              className={selectClass}
            >
              <option value="I">I</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
              <option value="V">V</option>
            </select>
          </div>
          <div>
            <Label htmlFor="salario">Salario (COP)</Label>
            <Input
              id="salario"
              name="salario"
              type="number"
              step="1"
              min="0"
              required
              className="mt-1"
            />
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
            <Label htmlFor="asesorComercialId">Asesor comercial</Label>
            <select
              id="asesorComercialId"
              name="asesorComercialId"
              defaultValue=""
              className={selectClass}
            >
              <option value="">— Ninguno —</option>
              {asesores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {state.error && <Alert variant="danger">{state.error}</Alert>}

      <Button type="submit" variant="gradient" size="lg" disabled={pending}>
        <Save className="h-4 w-4" />
        {pending ? 'Guardando…' : 'Crear afiliación'}
      </Button>
    </form>
  );
}
