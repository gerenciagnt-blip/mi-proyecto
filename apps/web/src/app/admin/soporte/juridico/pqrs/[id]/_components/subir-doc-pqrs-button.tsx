'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { subirDocumentoPqrsAction } from '../actions';

const MIMES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
const MAX_SIZE = 5 * 1024 * 1024;

export function SubirDocPqrsButton({
  pqrsId,
  consecutivo,
}: {
  pqrsId: string;
  consecutivo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!file) {
      setError('Selecciona un archivo.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('Archivo demasiado grande (máx 5 MB).');
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('pqrsId', pqrsId);
      fd.set('archivo', file);
      const r = await subirDocumentoPqrsAction({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setFile(null);
        setSuccess(false);
        if (inputRef.current) inputRef.current.value = '';
      }, 800);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Paperclip className="h-3.5 w-3.5" />
        Adjuntar documento
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Adjuntar documento · ${consecutivo}`}
        description="Documentos de soporte adjuntos por staff (oficios, evidencias, soportes adicionales)."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="archivo">Archivo</Label>
            <div className="mt-1 flex items-center gap-3">
              <input
                ref={inputRef}
                id="archivo"
                type="file"
                accept={MIMES}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-blue hover:file:bg-brand-blue/20"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">PDF, Word o imagen. Máximo 5 MB.</p>
            {file && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                <Upload className="h-3 w-3" />
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
          {error && (
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>Documento adjuntado.</p>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !file}>
              {pending ? 'Subiendo…' : 'Subir'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
