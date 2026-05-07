'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Plus, Trash2, Search } from 'lucide-react';
// NOTA: NO importar enums runtime de '@pila/db' — arrastra Prisma al
// bundle del navegador. Las constantes literales viven en validations.ts.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { radicarReporteAtAction, buscarCotizanteReporteAtAction } from '../actions';
import {
  CAUSA_LABEL,
  CAUSAS_REPORTE_AT,
  LATERALIDADES,
  LATERALIDAD_LABEL,
  TIPOS_DOC_AT,
  TIPO_DOC_AT_LABEL,
  type Lateralidad,
  type PartesCuerpoItem,
  type ReporteATCausaLit,
  type TipoDocAT,
} from '@/lib/reporte-at/validations';

type Sucursal = { id: string; codigo: string; nombre: string };

const CAUSAS_ORDEN = CAUSAS_REPORTE_AT;

export function RadicarReporteAtForm({
  sucursales,
  sucursalIdActual,
  elaboradoPorDefault,
  onSuccess,
}: {
  sucursales: Sucursal[];
  sucursalIdActual: string | null;
  elaboradoPorDefault: { nombre: string; correo: string };
  /**
   * Callback opcional que se ejecuta al radicar con éxito. Si no se
   * pasa, se usa el flujo standalone (redirect a la lista). Cuando el
   * form vive dentro de un modal, el shell pasa esta callback para
   * cerrar el dialog y refrescar la lista detrás.
   */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [pendingBusqueda, startBusqueda] = useTransition();

  const [sucursalId, setSucursalId] = useState(sucursalIdActual ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Causas (multiselect)
  const [causasSel, setCausasSel] = useState<Set<ReporteATCausaLit>>(new Set());
  const [causasOtros, setCausasOtros] = useState('');

  // Partes del cuerpo
  const [partes, setPartes] = useState<PartesCuerpoItem[]>([{ parte: '', lateralidad: 'NA' }]);

  // Datos del trabajador — controlados para que el auto-arrastre los
  // pueda rellenar al hallar el cotizante en BD.
  const [tipoDoc, setTipoDoc] = useState<TipoDocAT>('CC');
  const [numeroDoc, setNumeroDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [edad, setEdad] = useState('');
  const [eps, setEps] = useState('');
  const [fondoPension, setFondoPension] = useState('');
  const [experienciaMeses, setExperienciaMeses] = useState('');
  const [telefono, setTelefono] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [ciudadResidencia, setCiudadResidencia] = useState('');
  const [direccion, setDireccion] = useState('');
  const [empresaRazonSocial, setEmpresaRazonSocial] = useState('');
  const [empresaNit, setEmpresaNit] = useState('');

  /** Mensaje resultado de la búsqueda (info o error). null = sin búsqueda aún. */
  const [busquedaInfo, setBusquedaInfo] = useState<{ tipo: 'ok' | 'warn'; msg: string } | null>(
    null,
  );

  function buscarTrabajador() {
    setBusquedaInfo(null);
    if (!numeroDoc.trim()) {
      setBusquedaInfo({ tipo: 'warn', msg: 'Ingresa el número de documento' });
      return;
    }
    startBusqueda(async () => {
      const r = await buscarCotizanteReporteAtAction(tipoDoc, numeroDoc);
      if (!r.found) {
        setBusquedaInfo({
          tipo: 'warn',
          msg: r.error ?? 'No se encontró el cotizante; diligencia manualmente.',
        });
        return;
      }
      const d = r.found;
      // Sólo sobreescribe si el campo está vacío — preservamos lo que el
      // aliado haya empezado a escribir antes de buscar.
      const orStr = (cur: string, next: string | null) => (cur.trim() ? cur : (next ?? ''));
      const orNum = (cur: string, next: number | null) =>
        cur.trim() ? cur : next != null ? String(next) : '';
      setNombre((c) => orStr(c, d.nombreCompleto));
      setCargo((c) => orStr(c, d.cargo));
      setEdad((c) => orNum(c, d.edad));
      setEps((c) => orStr(c, d.eps));
      setFondoPension((c) => orStr(c, d.fondoPension));
      setTelefono((c) => orStr(c, d.telefono));
      setEstadoCivil((c) => orStr(c, d.estadoCivil));
      setCiudadResidencia((c) => orStr(c, d.ciudadResidencia));
      setDireccion((c) => orStr(c, d.direccion));
      setEmpresaRazonSocial((c) => orStr(c, d.empresaRazonSocial));
      setEmpresaNit((c) => orStr(c, d.empresaNit));
      setBusquedaInfo({
        tipo: 'ok',
        msg: `Cotizante encontrado: ${d.nombreCompleto}. Ajusta los campos si es necesario.`,
      });
    });
  }

  function toggleCausa(c: ReporteATCausaLit) {
    setCausasSel((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function setPartesItem(i: number, patch: Partial<PartesCuerpoItem>) {
    setPartes((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function agregarParte() {
    setPartes((prev) => [...prev, { parte: '', lateralidad: 'NA' }]);
  }

  function quitarParte(i: number) {
    setPartes((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function radicar() {
    if (!formRef.current) return;
    setError(null);
    setSuccess(null);

    // Validaciones front simples antes de enviar.
    const partesValidas = partes.filter((p) => p.parte.trim());
    if (partesValidas.length === 0) {
      setError('Indica al menos una parte del cuerpo afectada.');
      return;
    }
    if (causasSel.has('OTROS' as ReporteATCausaLit) && !causasOtros.trim()) {
      setError('Especifica la causa cuando seleccionas "Otros".');
      return;
    }
    if (!sucursalId) {
      setError('Selecciona la sucursal.');
      return;
    }

    const fd = new FormData(formRef.current);
    fd.set('sucursalId', sucursalId);
    fd.set('partesCuerpo', JSON.stringify(partesValidas));
    // FormData ya trae las causas (checkboxes con name="causas").

    startTransition(async () => {
      const r = await radicarReporteAtAction({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(r.mensaje ?? 'Radicado');
      // Modo modal: el shell sabe cómo cerrar/refrescar.
      if (onSuccess) {
        setTimeout(() => onSuccess(), 600);
        return;
      }
      // Standalone: redirect a la lista.
      setTimeout(() => {
        router.push('/admin/administrativo/reporte-at');
        router.refresh();
      }, 800);
    });
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        radicar();
      }}
      className="space-y-6"
    >
      {/* Sucursal (solo staff la elige; aliado la hereda) */}
      {sucursales.length > 0 && (
        <Section title="Sucursal a la que pertenece el reporte">
          <Field label="Sucursal" required>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
            >
              <option value="">Selecciona…</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} · {s.nombre}
                </option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      {/* Datos del accidente */}
      <Section title="Datos del accidente">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Fecha del accidente" required>
            <Input type="date" name="fechaAccidente" max={hoy} required />
          </Field>
          <Field label="Hora del accidente" hint="Formato 24h (HH:mm)" required>
            <Input type="time" name="horaAccidente" required />
          </Field>
          <Field label="Hora inicio jornada" hint="Formato 24h (HH:mm)" required>
            <Input type="time" name="horaInicioJornada" required />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Lugar (área y sección)" required className="md:col-span-1">
            <Input name="lugar" placeholder="Ej. Bodega, sección A" required />
          </Field>
          <Field label="Ciudad" required>
            <Input name="ciudadAccidente" required />
          </Field>
          <Field label="Departamento" required>
            <Input name="departamentoAccidente" required />
          </Field>
        </div>
      </Section>

      {/* Datos del trabajador — primero el documento para arrastrar BD */}
      <Section
        title="Datos del trabajador"
        hint="Ingresa el documento y pulsa Buscar para traer los datos del cotizante registrados en la sucursal."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr_auto]">
          <Field label="Tipo de documento" required>
            <select
              name="trabajadorTipoDoc"
              value={tipoDoc}
              onChange={(e) => setTipoDoc(e.target.value as TipoDocAT)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              required
            >
              {TIPOS_DOC_AT.map((t) => (
                <option key={t} value={t}>
                  {t} — {TIPO_DOC_AT_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Número de documento" required>
            <Input
              name="trabajadorNumeroDoc"
              value={numeroDoc}
              onChange={(e) => setNumeroDoc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  buscarTrabajador();
                }
              }}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              onClick={buscarTrabajador}
              disabled={pendingBusqueda || !numeroDoc.trim()}
            >
              <Search className="mr-1 h-4 w-4" />
              {pendingBusqueda ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
        </div>

        {busquedaInfo && (
          <Alert variant={busquedaInfo.tipo === 'ok' ? 'success' : 'warning'}>
            {busquedaInfo.tipo === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{busquedaInfo.msg}</span>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Nombre completo" className="md:col-span-2" required>
            <Input
              name="trabajadorNombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </Field>
          <Field label="Cargo" required>
            <Input
              name="trabajadorCargo"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="EPS">
            <Input name="trabajadorEps" value={eps} onChange={(e) => setEps(e.target.value)} />
          </Field>
          <Field label="Fondo de pensión">
            <Input
              name="trabajadorFondoPension"
              value={fondoPension}
              onChange={(e) => setFondoPension(e.target.value)}
            />
          </Field>
          <Field label="Experiencia en el cargo (meses)">
            <Input
              type="number"
              name="trabajadorExperienciaMeses"
              min={0}
              max={720}
              value={experienciaMeses}
              onChange={(e) => setExperienciaMeses(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Teléfono">
            <Input
              name="trabajadorTelefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Field>
          <Field label="Edad">
            <Input
              type="number"
              name="trabajadorEdad"
              min={0}
              max={120}
              value={edad}
              onChange={(e) => setEdad(e.target.value)}
            />
          </Field>
          <Field label="Estado civil">
            <Input
              name="trabajadorEstadoCivil"
              value={estadoCivil}
              onChange={(e) => setEstadoCivil(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Ciudad de residencia">
            <Input
              name="trabajadorCiudadResidencia"
              value={ciudadResidencia}
              onChange={(e) => setCiudadResidencia(e.target.value)}
            />
          </Field>
          <Field label="Dirección de residencia" className="md:col-span-2">
            <Input
              name="trabajadorDireccion"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* Empresa — también se rellena desde la afiliación activa */}
      <Section title="Empresa o razón social a la que está afiliado">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Razón social" className="md:col-span-2" required>
            <Input
              name="empresaRazonSocial"
              value={empresaRazonSocial}
              onChange={(e) => setEmpresaRazonSocial(e.target.value)}
              required
            />
          </Field>
          <Field label="NIT" required>
            <Input
              name="empresaNit"
              value={empresaNit}
              onChange={(e) => setEmpresaNit(e.target.value)}
              required
            />
          </Field>
        </div>
      </Section>

      {/* Hechos */}
      <Section title="Descripción de los hechos">
        <Field label="¿Qué ocurrió?" required>
          <Textarea name="hechosQueOcurrio" rows={3} required />
        </Field>
        <Field label="¿Cuándo y dónde ocurrió?" required>
          <Textarea name="hechosCuandoDonde" rows={3} required />
        </Field>
        <Field label="¿Cómo ocurrió?" required>
          <Textarea name="hechosComoOcurrio" rows={4} required />
        </Field>
      </Section>

      {/* Causas */}
      <Section title="Ud. cree que el evento pudo suceder por:" hint="Marca todas las que apliquen">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CAUSAS_ORDEN.map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm hover:border-brand-blue">
                <input
                  type="checkbox"
                  name="causas"
                  value={c}
                  checked={causasSel.has(c)}
                  onChange={() => toggleCausa(c)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span className="text-slate-700">{CAUSA_LABEL[c]}</span>
              </label>
            </li>
          ))}
        </ul>
        {causasSel.has('OTROS' as ReporteATCausaLit) && (
          <Field label="Especifica" required>
            <Input
              name="causasOtros"
              value={causasOtros}
              onChange={(e) => setCausasOtros(e.target.value)}
              required
            />
          </Field>
        )}
      </Section>

      {/* Partes del cuerpo */}
      <Section title="Parte(s) del cuerpo afectada(s) y lateralidad">
        <div className="space-y-2">
          {partes.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_auto]">
              <Input
                placeholder="Ej. Brazo, mano, pie…"
                value={p.parte}
                onChange={(e) => setPartesItem(i, { parte: e.target.value })}
              />
              <select
                value={p.lateralidad}
                onChange={(e) => setPartesItem(i, { lateralidad: e.target.value as Lateralidad })}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              >
                {LATERALIDADES.map((l) => (
                  <option key={l} value={l}>
                    {LATERALIDAD_LABEL[l]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => quitarParte(i)}
                disabled={partes.length === 1}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                aria-label="Quitar parte"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={agregarParte}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar otra parte
        </button>
      </Section>

      {/* Responsables */}
      <Section title="Responsable(s) del reporte">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Nombre" required>
            <Input name="responsableNombre" defaultValue={elaboradoPorDefault.nombre} required />
          </Field>
          <Field label="Teléfono" required>
            <Input name="responsableTelefono" required />
          </Field>
          <Field label="Correo electrónico" required>
            <Input
              type="email"
              name="responsableCorreo"
              defaultValue={elaboradoPorDefault.correo}
              required
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Si hay un segundo responsable (asesor, oficina), agrégalo abajo. Es opcional.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Nombre (opcional)">
            <Input name="responsable2Nombre" />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input name="responsable2Telefono" />
          </Field>
          <Field label="Correo (opcional)">
            <Input type="email" name="responsable2Correo" />
          </Field>
        </div>
      </Section>

      {/* Firma trabajador (correo) */}
      <Section title="Firma del trabajador">
        <Field label="Correo electrónico del trabajador (opcional)">
          <Input type="email" name="trabajadorCorreoFirma" />
        </Field>
      </Section>

      {/* Fecha de elaboración */}
      <Section title="Fecha de elaboración del reporte">
        <Field label="Fecha" required>
          <Input type="date" name="fechaElaboracion" defaultValue={hoy} max={hoy} required />
        </Field>
      </Section>

      {error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </Alert>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Radicando…' : 'Radicar reporte AT'}
        </Button>
      </div>
    </form>
  );
}

// =====================================================================
// Helpers visuales internos al form (no se exportan).
// =====================================================================

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-700">
          {title}
        </h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ?? ''}>
      <Label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
    />
  );
}
