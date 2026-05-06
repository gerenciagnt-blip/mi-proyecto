'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, AlertCircle, Download } from 'lucide-react';
import { solicitarCertificadoColpatriaAction } from './colpatria-cert-actions';

type Estado =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'queued'; jobId: string; status: 'PENDING' | 'RUNNING' }
  | { kind: 'ready'; jobId: string }
  | { kind: 'error'; mensaje: string };

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_INTENTOS = 60; // ~3 min de poll antes de rendirse

/**
 * Sprint 8.6 — Botón "Descargar certificado vigente" + flujo de polling.
 *
 * Usa cola asíncrona: clic → server action crea job PENDING → bot lo
 * procesa → polling cada 3s al endpoint de status → cuando ready,
 * dispara la descarga vía link directo al PDF.
 *
 * El `entregadoAt` que setea el endpoint del PDF asegura que un mismo
 * job no se descarga dos veces (la BD se queda con la evidencia pero
 * el archivo se borra). Si el usuario quiere otro, clica el botón
 * de nuevo y se crea un job nuevo.
 */
export function ColpatriaCertButton({ afiliacionId }: { afiliacionId: string }) {
  const [estado, setEstado] = useState<Estado>({ kind: 'idle' });
  const downloadRef = useRef<HTMLAnchorElement | null>(null);

  // Polling cuando estamos en `queued`
  useEffect(() => {
    if (estado.kind !== 'queued') return;
    let intento = 0;
    let cancelado = false;

    const tick = async () => {
      if (cancelado) return;
      intento++;
      try {
        const r = await fetch(`/api/colpatria/certificados/${estado.jobId}`, {
          cache: 'no-store',
        });
        if (!r.ok) {
          setEstado({ kind: 'error', mensaje: `No se pudo consultar el job (${r.status})` });
          return;
        }
        const j = (await r.json()) as {
          status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'RETRYABLE';
          error: string | null;
          ready: boolean;
        };
        if (j.ready) {
          setEstado({ kind: 'ready', jobId: estado.jobId });
          return;
        }
        // FAILED y RETRYABLE son ambos terminales para certificados:
        // no hay cron que recicle automático (es on-demand puro), así
        // que mostramos el error y dejamos que el usuario reintente.
        if (j.status === 'FAILED' || j.status === 'RETRYABLE') {
          setEstado({
            kind: 'error',
            mensaje: j.error ?? 'El bot terminó sin mensaje claro',
          });
          return;
        }
        if (intento >= POLL_MAX_INTENTOS) {
          setEstado({ kind: 'error', mensaje: 'Timeout esperando al bot (3 min).' });
          return;
        }
        // PENDING / RUNNING → seguir esperando
        setEstado({
          kind: 'queued',
          jobId: estado.jobId,
          status: j.status === 'RUNNING' ? 'RUNNING' : 'PENDING',
        });
      } catch (err) {
        setEstado({
          kind: 'error',
          mensaje: err instanceof Error ? err.message : 'Error de red',
        });
      }
    };

    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    // Primer tick inmediato (sin esperar 3s)
    void tick();
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [estado]);

  // Cuando está ready, disparar descarga automáticamente
  useEffect(() => {
    if (estado.kind === 'ready' && downloadRef.current) {
      downloadRef.current.click();
    }
  }, [estado]);

  const onClick = async () => {
    setEstado({ kind: 'requesting' });
    try {
      const r = await solicitarCertificadoColpatriaAction(afiliacionId);
      if (!r.ok) {
        setEstado({ kind: 'error', mensaje: r.error });
        return;
      }
      setEstado({ kind: 'queued', jobId: r.jobId, status: 'PENDING' });
    } catch (err) {
      setEstado({
        kind: 'error',
        mensaje: err instanceof Error ? err.message : 'Error inesperado',
      });
    }
  };

  // Render condicional
  if (estado.kind === 'idle' || estado.kind === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <FileText className="h-2.5 w-2.5" />
          Certificado vigente
        </button>
        {estado.kind === 'error' && (
          <p className="inline-flex items-start gap-1 text-[10px] text-red-700">
            <AlertCircle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
            {estado.mensaje}
          </p>
        )}
      </div>
    );
  }

  if (estado.kind === 'requesting' || estado.kind === 'queued') {
    const label =
      estado.kind === 'requesting'
        ? 'Solicitando…'
        : estado.status === 'RUNNING'
          ? 'Descargando del portal…'
          : 'En cola…';
    return (
      <button
        type="button"
        disabled
        className="inline-flex cursor-wait items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        {label}
      </button>
    );
  }

  // ready
  return (
    <>
      <a
        ref={downloadRef}
        href={`/api/colpatria/certificados/${estado.jobId}/pdf`}
        download
        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-200"
        onClick={() => {
          // Después de la descarga, volver a idle para permitir pedir otro
          window.setTimeout(() => setEstado({ kind: 'idle' }), 500);
        }}
      >
        <Download className="h-2.5 w-2.5" />
        Descargar certificado
      </a>
    </>
  );
}
