'use client';

/**
 * Modal público de radicación de PQRS. Se monta desde el footer y
 * desde cualquier link que apunte a "abrir PQRS".
 *
 * Flujo:
 *  1. Click en "PQRS" del footer → abre modal con form vacío.
 *  2. Solicitante completa los campos + adjunta documentos opcionales.
 *  3. Submit → server action crearPqrsPublicaAction → guarda en BD →
 *     dispara notificaciones (email + WhatsApp al admin).
 *  4. Pantalla de confirmación con consecutivo + plazo de respuesta.
 */

import { useState, useTransition } from 'react';
import { Send, Loader2, CheckCircle2, AlertTriangle, FileText, Paperclip, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { crearPqrsPublicaAction, type PqrsCrearResult } from './pqrs-actions';

const TIPOS = [
  { value: 'PETICION', label: 'Petición', desc: 'Información, copias o consulta', plazo: 10 },
  { value: 'QUEJA', label: 'Queja', desc: 'Inconformidad con el servicio', plazo: 15 },
  { value: 'RECLAMO', label: 'Reclamo', desc: 'Exigencia formal de un derecho', plazo: 15 },
  { value: 'SUGERENCIA', label: 'Sugerencia', desc: 'Propuesta de mejora', plazo: 30 },
  { value: 'FELICITACION', label: 'Felicitación', desc: 'Reconocimiento positivo', plazo: 30 },
] as const;

type Tipo = (typeof TIPOS)[number]['value'];

const TIPOS_DOC = ['CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP'] as const;

const inputCls =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20';

export function PqrsLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <PqrsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PqrsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<Tipo>('PETICION');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [resultado, setResultado] = useState<PqrsCrearResult | null>(null);

  const tipoMeta = TIPOS.find((t) => t.value === tipo)!;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    archivos.forEach((f) => fd.append('documento', f));
    startTransition(async () => {
      const r = await crearPqrsPublicaAction(fd);
      setResultado(r);
    });
  }

  function handleClose() {
    setResultado(null);
    setArchivos([]);
    setTipo('PETICION');
    onClose();
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setArchivos((prev) => [...prev, ...arr].slice(0, 5));
  }

  function removeFile(idx: number) {
    setArchivos((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="xl"
      title={resultado?.ok ? '¡PQRS radicada!' : 'Radicar una PQRS'}
      description={
        resultado?.ok
          ? 'Te responderemos en el plazo legal correspondiente.'
          : 'Petición, Queja, Reclamo, Sugerencia o Felicitación. Sin necesidad de crear cuenta.'
      }
    >
      {resultado?.ok ? (
        <Confirmacion result={resultado} onClose={handleClose} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selector de tipo — radio cards */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Tipo de solicitud *
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {TIPOS.map((t) => (
                <label
                  key={t.value}
                  className={`cursor-pointer rounded-lg border p-3 text-xs transition ${
                    tipo === t.value
                      ? 'border-brand-blue bg-brand-blue/5 text-brand-blue-dark ring-2 ring-brand-blue/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={t.value}
                    checked={tipo === t.value}
                    onChange={() => setTipo(t.value)}
                    className="sr-only"
                  />
                  <p className="font-bold">{t.label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{t.desc}</p>
                  <p className="mt-1.5 font-mono text-[10px] text-slate-400">
                    Plazo: {t.plazo} días háb.
                  </p>
                </label>
              ))}
            </div>
          </div>

          {/* Datos del solicitante */}
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Tus datos
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tipoDocumento" className="text-xs font-medium text-slate-700">
                  Tipo de documento *
                </label>
                <select
                  id="tipoDocumento"
                  name="tipoDocumento"
                  required
                  defaultValue="CC"
                  className={`${inputCls} mt-1`}
                >
                  {TIPOS_DOC.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="numeroDocumento" className="text-xs font-medium text-slate-700">
                  Número de documento *
                </label>
                <input
                  id="numeroDocumento"
                  name="numeroDocumento"
                  required
                  placeholder="123456789"
                  className={`${inputCls} mt-1`}
                />
              </div>
              <div>
                <label htmlFor="nombres" className="text-xs font-medium text-slate-700">
                  Nombres *
                </label>
                <input
                  id="nombres"
                  name="nombres"
                  required
                  placeholder="Tu nombre"
                  className={`${inputCls} mt-1`}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="apellidos" className="text-xs font-medium text-slate-700">
                  Apellidos
                </label>
                <input
                  id="apellidos"
                  name="apellidos"
                  placeholder="Tus apellidos"
                  className={`${inputCls} mt-1`}
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label htmlFor="email" className="text-xs font-medium text-slate-700">
                  Correo electrónico *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  className={`${inputCls} mt-1`}
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="telefono" className="text-xs font-medium text-slate-700">
                  Teléfono *
                </label>
                <input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  required
                  placeholder="+57 300 1234567"
                  className={`${inputCls} mt-1`}
                  autoComplete="tel"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="empresaNombre" className="text-xs font-medium text-slate-700">
                  Empresa que representas <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  id="empresaNombre"
                  name="empresaNombre"
                  placeholder="Si actúas en nombre de una empresa"
                  className={`${inputCls} mt-1`}
                  autoComplete="organization"
                />
              </div>
            </div>
          </fieldset>

          {/* Asunto + descripción */}
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Tu solicitud
            </legend>
            <div className="space-y-3">
              <div>
                <label htmlFor="asunto" className="text-xs font-medium text-slate-700">
                  Asunto *
                </label>
                <input
                  id="asunto"
                  name="asunto"
                  required
                  maxLength={200}
                  placeholder="En pocas palabras, ¿de qué se trata?"
                  className={`${inputCls} mt-1`}
                />
              </div>
              <div>
                <label htmlFor="descripcion" className="text-xs font-medium text-slate-700">
                  Descripción detallada *
                </label>
                <textarea
                  id="descripcion"
                  name="descripcion"
                  required
                  rows={6}
                  minLength={20}
                  maxLength={5000}
                  placeholder="Cuéntanos lo más detallado posible: qué pasó, cuándo, qué necesitas que hagamos."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
                <p className="mt-1 text-[10px] text-slate-400">Mínimo 20 caracteres.</p>
              </div>
            </div>
          </fieldset>

          {/* Adjuntos */}
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Documentos de soporte (opcional)
            </legend>
            <p className="text-xs text-slate-600">
              PDF, Word o imagen. Máximo 5 archivos · 5 MB cada uno.
            </p>
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => addFiles(e.target.files)}
              className="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-brand-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-blue-dark hover:file:bg-brand-blue/20"
            />
            {archivos.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {archivos.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                      aria-label="Quitar archivo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/* Plazo de respuesta */}
          <Alert variant="info">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="text-xs">
              Te responderemos en máximo <strong>{tipoMeta.plazo} días hábiles</strong> al correo
              indicado. Quedará registrada con un consecutivo único.
            </span>
          </Alert>

          {resultado && !resultado.ok && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{resultado.error}</span>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={pending}
              className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-gradient px-5 text-sm font-semibold text-white shadow-brand transition hover:shadow-brand-lg disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Radicar PQRS
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function Confirmacion({
  result,
  onClose,
}: {
  result: { ok: true; consecutivo: string; pqrsId: string };
  onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-4">
      <div className="flex items-center justify-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </span>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Tu número de radicado
        </p>
        <p className="mt-2 font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {result.consecutivo}
        </p>
        <p className="mt-3 max-w-md text-sm text-slate-600 sm:mx-auto">
          Hemos recibido tu solicitud. Te responderemos al correo que registraste dentro del plazo
          legal correspondiente. Guarda este número para hacer seguimiento.
        </p>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-semibold text-white shadow-brand"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
