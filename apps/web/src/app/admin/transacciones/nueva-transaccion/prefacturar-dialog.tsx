'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Receipt,
  Download,
  UserMinus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  procesarTransaccionAction,
  listarMediosPagoAction,
  type PreviewInput,
  type TipoTransaccion,
} from './actions';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type Props = {
  open: boolean;
  onClose: () => void;
  onProcesado: () => void;
  context: PreviewInput;
  tipo: TipoTransaccion;
  totalGeneral: number;
  totalAdmonInicial: number;
  destinatarioInfo: { nombre: string; sub?: string } | null;
  numAfiliaciones: number;
  /** Tipos de planilla PILA que se generarán al procesar (derivado de
   * modalidad + régimen + plan de cada afiliación). Un cotizante de
   * Resolución EPS+ARL produce 2 tipos (E + K). */
  tiposPlanilla: string[];
};

// El dropdown de forma de pago lista únicamente los medios configurados
// en el catálogo (efectivo, transferencia, etc.). El usuario selecciona
// directamente uno; internamente siempre se guarda como POR_MEDIO_PAGO
// + el medioPagoId elegido.

const TIPO_PLANILLA_LABEL: Record<string, string> = {
  E: 'Empleados',
  I: 'Independientes',
  Y: 'Indep. empresa',
  K: 'Solo ARL',
  N: 'Correcciones',
  A: 'Novedad ingreso',
  S: 'Servicio dom.',
};

export function PrefacturarDialog({
  open,
  onClose,
  onProcesado,
  context,
  tipo,
  totalGeneral,
  totalAdmonInicial,
  destinatarioInfo,
  numAfiliaciones,
  tiposPlanilla,
}: Props) {
  const [medioPagoId, setMedioPagoId] = useState<string>('');
  const [numero, setNumero] = useState('');
  const [fechaPago, setFechaPago] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [valorAdmonStr, setValorAdmonStr] = useState<string>('');
  const [aplicaNovedadRetiro, setAplicaNovedadRetiro] = useState(false);
  const [diasRetiroStr, setDiasRetiroStr] = useState<string>('30');
  const [medios, setMedios] = useState<
    Array<{ id: string; codigo: string; nombre: string }>
  >([]);
  const [loadingMedios, startLoad] = useTransition();

  const [procesando, startProcesar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{
    consecutivo: string;
    total: number;
    comprobanteId: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    startLoad(async () => {
      const m = await listarMediosPagoAction();
      setMedios(m);
      // Auto-selecciona el primer medio si hay exactamente uno
      if (m.length === 1 && m[0]) setMedioPagoId(m[0].id);
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setExito(null);
    } else {
      setValorAdmonStr(
        totalAdmonInicial > 0 ? String(Math.round(totalAdmonInicial)) : '',
      );
      setAplicaNovedadRetiro(false);
      setDiasRetiroStr('30');
      setMedioPagoId('');
      setNumero('');
    }
  }, [open, totalAdmonInicial]);

  // Parseo del override: si el usuario dejó el default o vacío, no mandamos override.
  // Si cambió el valor, mandamos valorAdminOverride por afiliación.
  // Como el motor aplica por afiliación, dividimos el total ingresado / n.
  const overrideNumber = (() => {
    const raw = valorAdmonStr.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return undefined;
    // Si coincide con el default (mismo total), no enviamos override
    if (Math.abs(n - totalAdmonInicial) < 1) return undefined;
    // Distribuye igualmente entre las afiliaciones
    return numAfiliaciones > 0 ? n / numAfiliaciones : n;
  })();

  // Total "preview" con el override aplicado — para feedback visual
  const totalPreview =
    overrideNumber != null
      ? totalGeneral - totalAdmonInicial + overrideNumber * numAfiliaciones
      : totalGeneral;

  // Días override: solo aplica cuando hay novedad de retiro y el valor es < 30
  const diasOverride = (() => {
    if (!aplicaNovedadRetiro) return undefined;
    const n = parseInt(diasRetiroStr, 10);
    if (!Number.isFinite(n) || n <= 0 || n >= 30) return undefined;
    return n;
  })();

  const onSubmit = () => {
    setError(null);
    setExito(null);

    if (!medioPagoId) {
      setError('Selecciona una forma de pago del catálogo');
      return;
    }

    startProcesar(async () => {
      const r = await procesarTransaccionAction({
        ...context,
        formaPago: 'POR_MEDIO_PAGO',
        medioPagoId,
        numeroComprobanteExt: numero.trim() || undefined,
        fechaPago,
        valorAdminOverride: overrideNumber,
        diasCotizadosOverride: diasOverride,
        aplicaNovedadRetiro: tipo === 'INDIVIDUAL' ? aplicaNovedadRetiro : false,
      });
      if (r.error) {
        setError(r.error);
      } else if (r.ok && r.consecutivo && r.comprobanteId) {
        setExito({
          consecutivo: r.consecutivo,
          total: r.totalGeneral ?? totalPreview,
          comprobanteId: r.comprobanteId,
        });
        window.open(`/api/comprobantes/${r.comprobanteId}/pdf`, '_blank');
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pre-facturar transacción"
      description="Completa los datos de pago antes de procesar."
      size="md"
    >
      {exito ? (
        <div className="space-y-3">
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div>
              <p>
                Transacción procesada · Comprobante{' '}
                <strong className="font-mono">{exito.consecutivo}</strong>
              </p>
              <p className="mt-0.5 text-xs">Total: {copFmt.format(exito.total)}</p>
              <p className="mt-1 text-[11px] text-emerald-900">
                El PDF se abrió en una pestaña nueva.
              </p>
            </div>
          </Alert>
          <div className="flex items-center justify-end gap-2">
            <a
              href={`/api/comprobantes/${exito.comprobanteId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Abrir PDF
            </a>
            <Button type="button" variant="gradient" onClick={onProcesado}>
              Nueva transacción
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          {/* Destinatario — header del modal */}
          {destinatarioInfo && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                {tipo === 'INDIVIDUAL'
                  ? 'Cotizante'
                  : tipo === 'EMPRESA_CC'
                    ? 'Empresa CC'
                    : 'Asesor'}
              </p>
              <p className="mt-0.5 font-medium text-slate-900">
                {destinatarioInfo.nombre}
              </p>
              {destinatarioInfo.sub && (
                <p className="font-mono text-xs text-slate-500">
                  {destinatarioInfo.sub}
                </p>
              )}
            </div>
          )}

          {/* Total */}
          <div className="rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-3">
            <p className="text-xs text-slate-500">Total a pre-facturar</p>
            <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-brand-blue-dark">
              {copFmt.format(totalPreview)}
            </p>
            {overrideNumber != null && (
              <p className="mt-1 text-[11px] text-amber-700">
                Incluye ajuste de valor administración (original:{' '}
                {copFmt.format(totalGeneral)})
              </p>
            )}
          </div>

          {/* Aviso de planillas PILA que se generarán — útil cuando es
              más de una (ej. Resolución EPS+ARL = E+K). */}
          {tiposPlanilla.length > 0 && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                tiposPlanilla.length > 1
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <p className="font-medium">
                {tiposPlanilla.length === 1
                  ? 'Planilla PILA que se generará'
                  : `Se generarán ${tiposPlanilla.length} planillas PILA`}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tiposPlanilla.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-medium ring-1 ring-inset ring-slate-200"
                  >
                    <span className="font-mono font-bold">{t}</span>
                    <span className="text-slate-500">·</span>
                    <span>{TIPO_PLANILLA_LABEL[t] ?? t}</span>
                  </span>
                ))}
              </div>
              {tiposPlanilla.length > 1 && (
                <p className="mt-1.5 text-[11px]">
                  El mismo comprobante se enlazará a ambas planillas en
                  Planos → Consolidado.
                </p>
              )}
            </div>
          )}

          {/* Valor admón editable */}
          <div>
            <Label htmlFor="valorAdmon">
              Valor administración (ajuste opcional)
            </Label>
            <Input
              id="valorAdmon"
              type="number"
              step="1"
              min="0"
              value={valorAdmonStr}
              onChange={(e) => setValorAdmonStr(e.target.value)}
              placeholder={String(Math.round(totalAdmonInicial))}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Sólo afecta esta transacción — no modifica la base de datos.
              {numAfiliaciones > 1 && (
                <>
                  {' '}
                  Se aplica por afiliación ({numAfiliaciones} afiliaciones).
                </>
              )}
            </p>
          </div>

          {/* Novedad de retiro — solo individual */}
          {tipo === 'INDIVIDUAL' && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={aplicaNovedadRetiro}
                  onChange={(e) => setAplicaNovedadRetiro(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <div className="flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <UserMinus className="h-3.5 w-3.5 text-red-600" />
                    Aplicar novedad de retiro
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    El cotizante se inactivará al procesar. Si la factura se anula, se
                    reactiva.
                  </p>
                </div>
              </label>

              {aplicaNovedadRetiro && (
                <div className="ml-6 flex items-center gap-3 border-t border-slate-100 pt-2">
                  <Label htmlFor="diasRetiro" className="text-xs">
                    Días a liquidar
                  </Label>
                  <Input
                    id="diasRetiro"
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    value={diasRetiroStr}
                    onChange={(e) => setDiasRetiroStr(e.target.value)}
                    className="h-8 w-20"
                  />
                  <p className="text-[10px] text-slate-500">
                    1 a 30. La SGSS se recalcula proporcional a estos días.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Forma de pago — solo medios del catálogo */}
          <div>
            <Label htmlFor="medioPago">Forma de pago *</Label>
            <select
              id="medioPago"
              value={medioPagoId}
              onChange={(e) => setMedioPagoId(e.target.value)}
              required
              disabled={loadingMedios || medios.length === 0}
              className="mt-1 h-10 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
            >
              <option value="">— Seleccionar —</option>
              {medios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo} — {m.nombre}
                </option>
              ))}
            </select>
            {loadingMedios && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Cargando medios de pago…
              </p>
            )}
            {!loadingMedios && medios.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                No hay medios de pago configurados. Agrégalos en{' '}
                <strong>Catálogos → Medios de pago</strong> antes de procesar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero">Número comprobante</Label>
              <Input
                id="numero"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Externo / opcional"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fechaPago">Fecha de pago *</Label>
              <Input
                id="fechaPago"
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                required
                className="mt-1"
              />
            </div>
          </div>

          {error && (
            <Alert variant="danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={procesando}>
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  <Save className="h-4 w-4" />
                  Procesar
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
