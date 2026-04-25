'use client';

/**
 * Celda compacta que se muestra en la tabla de planillas tab "Guardado":
 *
 *   - Sin validar        → botón [Validar en PagoSimple]
 *                          (sube el plano y valida en una sola llamada)
 *   - Validada OK        → badge verde + botón [Pagar PSE]
 *   - Con errores        → badge ámbar + botón [Revalidar]
 *
 * Cada acción es reintentable.
 */

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  CloudUpload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  validarPlanillaPagosimpleAction,
  obtenerPagoPsePagosimpleAction,
} from './pagosimple-action';

type EstadoValidacion = string | null; // 'PENDIENTE' | 'OK' | 'WARNING' | 'ERROR' | ...

export type PagosimpleCellProps = {
  planillaId: string;
  pagosimpleNumero: string | null;
  pagosimpleEstadoValidacion: EstadoValidacion;
  pagosimplePaymentUrl: string | null;
};

export function PagosimpleCell(props: PagosimpleCellProps) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [flashKind, setFlashKind] = useState<'ok' | 'err'>('ok');

  // Estado local (se actualiza tras cada action) para feedback inmediato
  // sin tener que esperar al revalidate del router.
  const [numero, setNumero] = useState(props.pagosimpleNumero);
  const [estado, setEstado] = useState<EstadoValidacion>(props.pagosimpleEstadoValidacion);
  const [payUrl, setPayUrl] = useState(props.pagosimplePaymentUrl);

  const say = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setFlash(msg);
    setFlashKind(kind);
    // auto-clear después de 6s para no ensuciar la tabla
    setTimeout(() => setFlash(null), 6000);
  };

  const handleValidar = () => {
    startTransition(async () => {
      const res = await validarPlanillaPagosimpleAction(props.planillaId);
      if (res.ok) {
        setNumero(res.payrollNumber);
        setEstado(res.validationStatus);
        setPayUrl(null);
        const errs =
          res.response.payroll_validations?.reduce(
            (s, p) => s + (p.number_errors_company ?? 0) + (p.number_errors_contributor ?? 0),
            0,
          ) ?? 0;
        if (res.validationStatus === 'OK') say(`Validación OK · N° ${res.payrollNumber}`);
        else if (errs > 0) say(`${errs} errores — N° ${res.payrollNumber}`, 'err');
        else say(`Validación: ${res.validationStatus}`, 'err');
      } else {
        say(res.error, 'err');
      }
    });
  };

  const handlePagar = () => {
    startTransition(async () => {
      const res = await obtenerPagoPsePagosimpleAction(props.planillaId);
      if (res.ok) {
        setPayUrl(res.url);
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        say(res.error, 'err');
      }
    });
  };

  // ------ Render según estado ------
  const sinValidar = !numero;
  const validadaOk = numero && estado === 'OK';
  const conErrores = numero && estado && estado !== 'OK' && estado.toUpperCase() !== 'OK';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {sinValidar && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleValidar}
            disabled={pending}
            title="Sube el plano a PagoSimple y dispara las validaciones SGSS"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudUpload className="h-3.5 w-3.5" />
            )}
            <span>Validar en PagoSimple</span>
          </Button>
        )}

        {validadaOk && (
          <>
            <Badge kind="ok">OK · N° {numero}</Badge>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePagar}
              disabled={pending}
              title={payUrl ? 'Abrir URL PSE (cacheada)' : 'Obtener URL PSE'}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              <span>{payUrl ? 'Ir a pagar' : 'Pagar PSE'}</span>
            </Button>
          </>
        )}

        {conErrores && (
          <>
            <Badge kind="err">
              {estado} · N° {numero}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleValidar}
              disabled={pending}
              title="Reintentar validación"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Revalidar</span>
            </Button>
          </>
        )}
      </div>

      {flash && (
        <div
          className={cn(
            'inline-flex max-w-[260px] items-start gap-1 rounded-md px-2 py-0.5 text-[10px] leading-tight',
            flashKind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
              : 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
          )}
        >
          {flashKind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span className="break-words">{flash}</span>
        </div>
      )}
    </div>
  );
}

function Badge({
  kind,
  children,
}: {
  kind: 'ok' | 'err' | 'pendiente';
  children: React.ReactNode;
}) {
  const cls =
    kind === 'ok'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : kind === 'err'
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : 'bg-sky-50 text-sky-700 ring-sky-200';
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'err' ? AlertTriangle : AlertCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono">{children}</span>
    </span>
  );
}
