'use client';

import { useActionState, useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { calcularDV } from '@/lib/nit';
import { createCuentaCobroAction, type ActionState } from './actions';

type Sucursal = { id: string; codigo: string; nombre: string };

const sectionClass = 'rounded-lg border border-slate-200 bg-white p-4';
const sectionTitleClass = 'mb-3 text-sm font-semibold text-slate-900';

export function CreateCuentaCobroForm({
  sucursales,
  onSuccess,
}: {
  sucursales: Sucursal[];
  onSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCuentaCobroAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  const [nit, setNit] = useState('');
  const [dv, setDv] = useState('');
  const [dvAuto, setDvAuto] = useState(true);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setNit('');
      setDv('');
      setDvAuto(true);
      onSuccess?.();
    }
  }, [state.ok, onSuccess]);

  useEffect(() => {
    if (dvAuto) setDv(calcularDV(nit) ?? '');
  }, [nit, dvAuto]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      {/* Identificación */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Identificación</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {sucursales.length === 1 ? (
            // Caso aliado (scoped a su única sucursal) o staff con 1 sola:
            // se pre-selecciona y se muestra como texto en lugar del select.
            <div>
              <Label>Sucursal</Label>
              <input type="hidden" name="sucursalId" value={sucursales[0]!.id} />
              <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                {sucursales[0]!.codigo} — {sucursales[0]!.nombre}
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="sucursalId">Sucursal *</Label>
              <Select id="sucursalId" name="sucursalId" required className="mt-1">
                <option value="">—</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo} — {s.nombre}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="codigo">Código interno *</Label>
            <Input
              id="codigo"
              name="codigo"
              required
              placeholder="CCB-001"
              className="mt-1 uppercase"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="razonSocial">Razón social *</Label>
            <Input id="razonSocial" name="razonSocial" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="nit">NIT</Label>
            <Input
              id="nit"
              name="nit"
              value={nit}
              onChange={(e) => setNit(e.target.value.replace(/\D/g, ''))}
              placeholder="900123456"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="dv">DV</Label>
            <Input
              id="dv"
              name="dv"
              maxLength={1}
              value={dv}
              onChange={(e) => {
                setDvAuto(false);
                setDv(e.target.value.replace(/\D/g, ''));
              }}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              {dvAuto ? 'Auto' : 'Manual'}
            </p>
          </div>
          <div>
            <Label htmlFor="tipoPersona">Tipo persona</Label>
            <Select id="tipoPersona" name="tipoPersona" defaultValue="" className="mt-1">
              <option value="">—</option>
              <option value="JURIDICA">Jurídica</option>
              <option value="NATURAL">Natural</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Rep legal */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Representante legal (opcional)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="repLegalTipoDoc">Tipo doc.</Label>
            <Select
              id="repLegalTipoDoc"
              name="repLegalTipoDoc"
              defaultValue=""
              className="mt-1"
            >
              <option value="">—</option>
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="NIT">NIT</option>
              <option value="PAS">PAS</option>
              <option value="TI">TI</option>
              <option value="RC">RC</option>
              <option value="NIP">NIP</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="repLegalNumeroDoc">Número doc.</Label>
            <Input id="repLegalNumeroDoc" name="repLegalNumeroDoc" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="repLegalNombre">Nombre completo</Label>
            <Input id="repLegalNombre" name="repLegalNombre" className="mt-1" />
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Contacto (opcional)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" name="telefono" className="mt-1" />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" className="mt-1" />
          </div>
        </div>
      </div>

      {state.error && <Alert variant="danger">{state.error}</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear cuenta de cobro'}
      </Button>
    </form>
  );
}
