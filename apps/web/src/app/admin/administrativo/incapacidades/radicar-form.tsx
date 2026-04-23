'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Upload,
  FileText,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  buscarCotizanteIncapAction,
  radicarIncapacidadAction,
  type CotizanteIncap,
} from './actions';
import {
  TIPO_LABEL,
  DOC_TIPO_LABEL,
} from '@/lib/incapacidades/validations';

const TIPOS = Object.entries(TIPO_LABEL) as [keyof typeof TIPO_LABEL, string][];
const DOC_TIPOS = Object.entries(DOC_TIPO_LABEL) as [
  keyof typeof DOC_TIPO_LABEL,
  string,
][];

export function RadicarIncapacidadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  // Paso 1: búsqueda del cotizante
  const [tipoDocumento, setTipoDocumento] = useState('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [cotizante, setCotizante] = useState<CotizanteIncap | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  // Paso 2: formulario
  const [tipo, setTipo] = useState<keyof typeof TIPO_LABEL>('ENFERMEDAD_GENERAL');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivos, setArchivos] = useState<
    Partial<Record<keyof typeof DOC_TIPO_LABEL, File>>
  >({});

  const [errorRadicar, setErrorRadicar] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function buscar() {
    setErrorBusqueda(null);
    setCotizante(null);
    startTransition(async () => {
      const r = await buscarCotizanteIncapAction(tipoDocumento, numeroDocumento);
      if (!r.found) {
        setErrorBusqueda(r.error ?? 'No se encontró el cotizante');
        return;
      }
      setCotizante(r.found);
    });
  }

  function handleFile(tipo: keyof typeof DOC_TIPO_LABEL, file: File | null) {
    setArchivos((prev) => {
      const next = { ...prev };
      if (file) next[tipo] = file;
      else delete next[tipo];
      return next;
    });
  }

  function radicar() {
    if (!cotizante) return;
    setErrorRadicar(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append('tipo', tipo);
    fd.append('tipoDocumento', cotizante.tipoDocumento);
    fd.append('numeroDocumento', cotizante.numeroDocumento);
    fd.append('fechaInicio', fechaInicio);
    fd.append('fechaFin', fechaFin);
    if (observaciones) fd.append('observaciones', observaciones);
    for (const [k, f] of Object.entries(archivos)) {
      if (f) fd.append(`doc.${k}`, f);
    }
    startTransition(async () => {
      const r = await radicarIncapacidadAction({}, fd);
      if (r.error) {
        setErrorRadicar(r.error);
        return;
      }
      setSuccess(r.mensaje ?? 'Radicada correctamente');
      formRef.current?.reset();
      setArchivos({});
      setCotizante(null);
      setNumeroDocumento('');
      setFechaInicio('');
      setFechaFin('');
      setObservaciones('');
      router.refresh();
    });
  }

  const diasCalc = (() => {
    if (!fechaInicio || !fechaFin) return 0;
    const fi = new Date(fechaInicio);
    const ff = new Date(fechaFin);
    if (Number.isNaN(fi.getTime()) || Number.isNaN(ff.getTime()) || ff < fi) return 0;
    return Math.round((ff.getTime() - fi.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  })();

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        radicar();
      }}
      className="space-y-5"
    >
      {/* Paso 1 — Buscar cotizante */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          1 · Cotizante afectado
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Buscamos dentro de tu sucursal para arrastrar empresa planilla,
          entidades SGSS y fecha de afiliación.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-1">
            <Label htmlFor="tipoDocumento">Tipo</Label>
            <Select
              id="tipoDocumento"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              className="mt-1"
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="TI">TI</option>
              <option value="PAS">PAS</option>
              <option value="RC">RC</option>
              <option value="NIP">NIP</option>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="numeroDocumento">Número de documento</Label>
            <Input
              id="numeroDocumento"
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value.toUpperCase())}
              placeholder="1234567890"
              className="mt-1"
              required
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              onClick={buscar}
              disabled={pending || !numeroDocumento.trim()}
              className="w-full"
            >
              <Search className="h-3.5 w-3.5" />
              {pending ? 'Buscando…' : 'Buscar cotizante'}
            </Button>
          </div>
        </div>

        {errorBusqueda && (
          <Alert variant="danger" className="mt-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>{errorBusqueda}</p>
          </Alert>
        )}

        {cotizante && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
            <p className="text-xs font-semibold text-emerald-900">
              ✓ {cotizante.nombreCompleto}
            </p>
            <p className="font-mono text-[10px] text-emerald-700">
              {cotizante.tipoDocumento} {cotizante.numeroDocumento}
            </p>
            {cotizante.afiliacionActiva ? (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-700 sm:grid-cols-5">
                <Snap label="Empresa planilla" value={cotizante.afiliacionActiva.empresaPlanillaNombre} />
                <Snap label="EPS" value={cotizante.afiliacionActiva.epsNombre} />
                <Snap label="AFP" value={cotizante.afiliacionActiva.afpNombre} />
                <Snap label="ARL" value={cotizante.afiliacionActiva.arlNombre} />
                <Snap label="CCF" value={cotizante.afiliacionActiva.ccfNombre} />
                <Snap
                  label="Fecha afiliación"
                  value={cotizante.afiliacionActiva.fechaIngreso}
                />
              </dl>
            ) : (
              <p className="mt-2 text-[11px] text-amber-700">
                ⚠ El cotizante no tiene afiliación activa — puedes radicar
                de todas formas pero los snapshots quedarán vacíos.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Paso 2 — Detalles de la incapacidad */}
      <fieldset
        className="space-y-4 disabled:opacity-40 disabled:pointer-events-none"
        disabled={!cotizante}
      >
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            2 · Detalles de la incapacidad
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Label htmlFor="tipo">Tipo de incapacidad</Label>
              <Select
                id="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as keyof typeof TIPO_LABEL)}
                className="mt-1"
              >
                {TIPOS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="fechaInicio">Fecha inicio</Label>
              <Input
                id="fechaInicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="fechaFin">Fecha fin</Label>
              <Input
                id="fechaFin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Días</Label>
              <p className="mt-1 inline-flex h-10 items-center gap-1 rounded-md bg-slate-50 px-3 font-mono text-sm text-slate-700">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {diasCalc}
              </p>
            </div>
            <div className="sm:col-span-6">
              <Label htmlFor="observaciones">Observaciones (opcional)</Label>
              <textarea
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Contexto clínico o administrativo adicional…"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
              />
            </div>
          </div>
        </section>

        {/* Paso 3 — Adjuntos */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            3 · Documentos adjuntos
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            PDF o imágenes (JPG/PNG/WebP). Máx 5 MB por documento. El{' '}
            <strong>Certificado de incapacidad</strong> es obligatorio.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DOC_TIPOS.map(([k, label]) => (
              <DocField
                key={k}
                tipo={k}
                label={label}
                file={archivos[k] ?? null}
                onChange={(f) => handleFile(k, f)}
                required={k === 'CERTIFICADO_INCAPACIDAD'}
              />
            ))}
          </div>
        </section>
      </fieldset>

      {errorRadicar && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{errorRadicar}</p>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p>{success}</p>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          disabled={pending || !cotizante || !fechaInicio || !fechaFin}
        >
          <Upload className="h-4 w-4" />
          {pending ? 'Radicando…' : 'Radicar incapacidad'}
        </Button>
      </div>
    </form>
  );
}

function Snap({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="font-medium text-slate-800">{value ?? '—'}</p>
    </div>
  );
}

function DocField({
  tipo,
  label,
  file,
  onChange,
  required,
}: {
  tipo: string;
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
}) {
  const id = `doc-${tipo}`;
  return (
    <div
      className={`rounded-lg border ${file ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'} p-3`}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-700">
            {label}{' '}
            {required && <span className="text-red-600">*</span>}
          </p>
          {file ? (
            <p className="mt-1 text-[10px] text-emerald-700">
              <Paperclip className="inline h-3 w-3" /> {file.name} ·{' '}
              {(file.size / 1024).toFixed(0)} KB
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-slate-500">
              <FileText className="inline h-3 w-3" /> Click para adjuntar (PDF/JPG/PNG)
            </p>
          )}
        </div>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
            }}
            className="rounded-md p-1 text-red-600 hover:bg-red-100"
            aria-label="Quitar archivo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </div>
  );
}
