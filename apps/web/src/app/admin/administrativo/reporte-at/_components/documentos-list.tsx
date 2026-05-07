import Link from 'next/link';
import { Paperclip, FileText, Download } from 'lucide-react';

export type ReporteAtDocumentoRow = {
  id: string;
  tipo: 'FURAT' | 'OTRO';
  archivoNombreOriginal: string;
  archivoSize: number;
  eliminado: boolean;
  eliminadoEn: Date | null;
  createdAt: Date;
  userName: string | null;
};

const TIPO_LABEL: Record<ReporteAtDocumentoRow['tipo'], string> = {
  FURAT: 'FURAT',
  OTRO: 'Otro soporte',
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lista de adjuntos del reporte AT. Solo se muestra a Soporte (la
 * vista del aliado no la incluye porque los soportes son operativos
 * del staff). El link de descarga apunta al endpoint API que valida
 * permisos.
 */
export function ReporteAtDocumentosList({
  reporteAtId,
  documentos,
}: {
  reporteAtId: string;
  documentos: ReporteAtDocumentoRow[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wider text-slate-700">
        <Paperclip className="h-3.5 w-3.5" />
        Documentos
      </h3>

      {documentos.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sin documentos cargados. Adjunta el FURAT u otros soportes desde “Gestionar estado”.
        </p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-blue ring-1 ring-inset ring-brand-blue/30">
                    {TIPO_LABEL[d.tipo]}
                  </span>
                  <span className="truncate font-medium text-slate-800">
                    {d.archivoNombreOriginal}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatBytes(d.archivoSize)} · {d.userName ? `${d.userName} · ` : ''}
                  {d.createdAt.toLocaleString('es-CO')}
                  {d.eliminado && (
                    <span className="ml-1 text-amber-600">
                      · archivo eliminado por retención (30d)
                    </span>
                  )}
                </p>
              </div>
              {!d.eliminado && (
                <Link
                  href={`/api/reporte-at/${reporteAtId}/documentos/${d.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-brand-blue hover:text-brand-blue"
                  prefetch={false}
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
