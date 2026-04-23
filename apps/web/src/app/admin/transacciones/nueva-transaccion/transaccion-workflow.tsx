'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import {
  Search,
  User,
  Building2,
  Users2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  buscarCotizanteAction,
  listarCuentasCobroAction,
  listarAsesoresAction,
  previsualizarTransaccionAction,
  type TipoTransaccion,
  type CotizanteEncontrado,
  type CuentaCobroDisponible,
  type AsesorDisponible,
  type PreviewRow,
  type PreviewInput,
} from './actions';
import { planillasParaAfiliacion } from '@/lib/planos/politicas';
import { PreviewTable } from './preview-table';
import { PrefacturarDialog } from './prefacturar-dialog';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const TIPOS: Array<{
  id: TipoTransaccion;
  label: string;
  icon: typeof User;
}> = [
  { id: 'INDIVIDUAL', label: 'Individual', icon: User },
  { id: 'EMPRESA_CC', label: 'Empresa CC', icon: Building2 },
  { id: 'ASESOR', label: 'Asesor comercial', icon: Users2 },
];

export type PeriodoOpt = {
  id: string;
  anio: number;
  mes: number;
  label: string; // "2026-04"
  mesLabel: string; // "Abril"
  cerrado: boolean;
};

type Props = {
  periodos: PeriodoOpt[];
};

export function TransaccionWorkflow({ periodos }: Props) {
  // Período seleccionado. Default = el primero habilitado (mes en curso).
  const defaultPeriodoId = periodos[0]?.id ?? '';
  const [periodoId, setPeriodoId] = useState<string>(defaultPeriodoId);
  const periodoActual =
    periodos.find((p) => p.id === periodoId) ?? periodos[0];
  const periodoCerrado = periodoActual?.cerrado ?? false;

  const [tipo, setTipo] = useState<TipoTransaccion>('INDIVIDUAL');

  // Destinatario (según tipo). Para INDIVIDUAL usamos cotizanteId y el
  // motor agrupa TODAS sus afiliaciones activas.
  const [cotizanteId, setCotizanteId] = useState<string>('');
  const [cuentaCobroId, setCuentaCobroId] = useState<string>('');
  const [asesorComercialId, setAsesorComercialId] = useState<string>('');

  // Metadatos del destinatario — se muestran en el Pre-facturar modal
  const [destinatarioInfo, setDestinatarioInfo] = useState<{
    nombre: string;
    sub?: string; // ej: "CC 1088002872" o "CCB-001 · NIT 900123456"
  } | null>(null);

  // Key para forzar remount de los sub-componentes (reset visual) después
  // de procesar una transacción con éxito.
  const [resetKey, setResetKey] = useState(0);

  // Preview
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [totales, setTotales] = useState<{
    sgss: number;
    admon: number;
    servicios: number;
    general: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();

  // Tipos de planilla que se van a generar al procesar — calculado a
  // partir de las rows del preview. Para Resolución EPS+ARL serán 2
  // tipos (E + K), para otros casos normalmente 1.
  const tiposPlanilla = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const tipos = planillasParaAfiliacion({
        modalidad: r.modalidad,
        regimen: r.regimen,
        plan: r.plan,
      });
      for (const t of tipos) set.add(t);
    }
    return Array.from(set).sort();
  }, [rows]);

  // Pre-facturar
  const [prefactOpen, setPrefactOpen] = useState(false);

  // Reset al cambiar de tipo o de período (cambia "sin movimiento" y
  // la validación de unicidad).
  useEffect(() => {
    setCotizanteId('');
    setCuentaCobroId('');
    setAsesorComercialId('');
    setDestinatarioInfo(null);
    setRows(null);
    setTotales(null);
    setPreviewError(null);
    // Remonta sub-componentes (input de documento, listados)
    setResetKey((k) => k + 1);
  }, [tipo, periodoId]);

  const destinatarioListo =
    (tipo === 'INDIVIDUAL' && !!cotizanteId) ||
    (tipo === 'EMPRESA_CC' && !!cuentaCobroId) ||
    (tipo === 'ASESOR' && !!asesorComercialId);

  // Correr preview cuando se selecciona el destinatario
  useEffect(() => {
    if (!destinatarioListo) {
      setRows(null);
      setTotales(null);
      setPreviewError(null);
      return;
    }
    startPreview(async () => {
      setPreviewError(null);
      const r = await previsualizarTransaccionAction({
        periodoId,
        tipo,
        cotizanteId: cotizanteId || undefined,
        cuentaCobroId: cuentaCobroId || undefined,
        asesorComercialId: asesorComercialId || undefined,
      });
      if (r.error) {
        setPreviewError(r.error);
        setRows(null);
        setTotales(null);
      } else {
        setRows(r.rows ?? []);
        setTotales(r.totales ?? null);
      }
    });
  }, [
    destinatarioListo,
    periodoId,
    tipo,
    cotizanteId,
    cuentaCobroId,
    asesorComercialId,
  ]);

  const onProcesado = () => {
    setPrefactOpen(false);
    // Limpiar TODO (selección + input de documento + listas) para nueva tx
    setCotizanteId('');
    setCuentaCobroId('');
    setAsesorComercialId('');
    setDestinatarioInfo(null);
    setRows(null);
    setTotales(null);
    setPreviewError(null);
    setResetKey((k) => k + 1); // fuerza remount de BuscarCotizante/SeleccionarCC/SeleccionarAsesor
  };

  const contextParaProcesar: PreviewInput = {
    periodoId,
    tipo,
    cotizanteId: cotizanteId || undefined,
    cuentaCobroId: cuentaCobroId || undefined,
    asesorComercialId: asesorComercialId || undefined,
  };

  return (
    <div className="space-y-4">
      {/* Período + Tipo — todo en una fila */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Label className="text-[10px] uppercase tracking-wider text-slate-400">
          Tipo de transacción
        </Label>
        <div className="mt-2 flex flex-wrap items-stretch gap-2">
          {/* Selector de período — primer chip */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Período
            </span>
            <select
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="h-7 rounded-md border-0 bg-transparent pr-6 font-mono text-sm font-semibold text-brand-blue-dark focus:outline-none focus:ring-1 focus:ring-brand-blue"
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.cerrado ? ' (cerrado)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Separador visual */}
          <div className="hidden w-px self-stretch bg-slate-200 sm:block" aria-hidden />

          {/* Botones de tipo */}
          {TIPOS.map((t) => {
            const Icon = t.icon;
            const active = tipo === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition',
                  active
                    ? 'border-brand-blue bg-brand-blue/5 text-brand-blue-dark ring-1 ring-brand-blue'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        {periodoActual && (
          <p className="mt-2 text-[11px] text-slate-500">
            {periodoActual.mesLabel} {periodoActual.anio}
            {periodoActual.cerrado && (
              <span className="ml-2 text-amber-700">· Período cerrado</span>
            )}
          </p>
        )}
      </section>

      {periodoCerrado && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Período cerrado</p>
            <p className="mt-0.5 text-xs">
              Solo se permite emitir <strong>vinculaciones</strong> (afiliaciones nuevas
              que ingresaron dentro del mes). Las mensualidades quedan bloqueadas hasta
              reabrir el período (se reabre automáticamente al anular una factura de
              cierre masivo).
            </p>
          </div>
        </Alert>
      )}

      {/* Selector de destinatario según tipo */}
      {tipo === 'INDIVIDUAL' && (
        <BuscarCotizante
          key={`cot-${resetKey}`}
          periodoId={periodoId}
          onCotizanteFound={(id, info) => {
            setCotizanteId(id);
            if (info) setDestinatarioInfo(info);
            else setDestinatarioInfo(null);
          }}
        />
      )}
      {tipo === 'EMPRESA_CC' && (
        <SeleccionarCC
          key={`cc-${resetKey}`}
          periodoId={periodoId}
          value={cuentaCobroId}
          onChange={(id, info) => {
            setCuentaCobroId(id);
            setDestinatarioInfo(info ?? null);
          }}
        />
      )}
      {tipo === 'ASESOR' && (
        <SeleccionarAsesor
          key={`as-${resetKey}`}
          periodoId={periodoId}
          value={asesorComercialId}
          onChange={(id, info) => {
            setAsesorComercialId(id);
            setDestinatarioInfo(info ?? null);
          }}
        />
      )}

      {/* Preview + acciones */}
      {destinatarioListo && (
        <section className="space-y-3">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              Detalle de la transacción
              {previewing && (
                <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-slate-400" />
              )}
            </h3>
            {rows && rows.length > 0 && totales && (
              <Button
                type="button"
                variant="gradient"
                onClick={() => setPrefactOpen(true)}
              >
                <Receipt className="h-4 w-4" />
                Pre-facturar
              </Button>
            )}
          </header>

          {previewError && (
            <Alert variant="danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </Alert>
          )}

          {rows && rows.length > 0 && totales && (
            <>
              <PreviewTable rows={rows} />

              {/* Totales agregados */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
                <TotalCell label="Valor SGSS" value={copFmt.format(totales.sgss)} />
                <TotalCell label="Admón" value={copFmt.format(totales.admon)} />
                <TotalCell
                  label="Servicios adicionales"
                  value={copFmt.format(totales.servicios)}
                />
                <TotalCell
                  label="Total"
                  value={copFmt.format(totales.general)}
                  highlight
                />
              </div>
            </>
          )}
        </section>
      )}

      {prefactOpen && totales && (
        <PrefacturarDialog
          open={prefactOpen}
          onClose={() => setPrefactOpen(false)}
          onProcesado={onProcesado}
          context={contextParaProcesar}
          totalGeneral={totales.general}
          totalAdmonInicial={totales.admon}
          tipo={tipo}
          destinatarioInfo={destinatarioInfo}
          numAfiliaciones={rows?.length ?? 1}
          tiposPlanilla={tiposPlanilla}
        />
      )}
    </div>
  );
}

// ========== Sub-selectores ==========

function BuscarCotizante({
  periodoId,
  onCotizanteFound,
}: {
  periodoId: string;
  onCotizanteFound: (
    cotizanteId: string,
    info?: { nombre: string; sub?: string } | null,
  ) => void;
}) {
  const [doc, setDoc] = useState('');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CotizanteEncontrado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buscar = () => {
    setError(null);
    setResult(null);
    onCotizanteFound('', null);
    start(async () => {
      const r = await buscarCotizanteAction(doc, periodoId);
      if (r.error) {
        setError(r.error);
      } else if (r.found) {
        setResult(r.found);
        // Bloqueo por unicidad: si ya hay factura en este período,
        // NO disparar preview; el alert aparece debajo.
        if (r.found.facturaExistente) {
          return;
        }
        const activas = r.found.afiliaciones.filter((a) => a.estado === 'ACTIVA');
        if (activas.length === 0) {
          setError('El cotizante no tiene afiliaciones activas');
        } else {
          onCotizanteFound(r.found.cotizante.id, {
            nombre: r.found.cotizante.nombreCompleto,
            sub: `${r.found.cotizante.tipoDocumento} ${r.found.cotizante.numeroDocumento}`,
          });
        }
      }
    });
  };

  const facturaExistente = result?.facturaExistente;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header>
        <Label className="text-[10px] uppercase tracking-wider text-slate-400">
          Buscar cotizante
        </Label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Al encontrar el cotizante se liquidan todas sus afiliaciones activas
        </p>
      </header>

      <div className="flex gap-2">
        <Input
          type="text"
          value={doc}
          onChange={(e) => setDoc(e.target.value.toUpperCase())}
          placeholder="Número de documento (ej. 1088002872)"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              buscar();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={buscar}
          disabled={pending || !doc.trim()}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar
        </Button>
      </div>

      {error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {result && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="font-medium text-slate-900">{result.cotizante.nombreCompleto}</p>
          <p className="font-mono text-xs text-slate-500">
            {result.cotizante.tipoDocumento} {result.cotizante.numeroDocumento} ·{' '}
            {result.afiliaciones.filter((a) => a.estado === 'ACTIVA').length}{' '}
            {result.afiliaciones.filter((a) => a.estado === 'ACTIVA').length === 1
              ? 'afiliación activa'
              : 'afiliaciones activas'}
          </p>
        </div>
      )}

      {facturaExistente && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              Este cotizante ya tiene factura procesada en el período.
            </p>
            <p className="mt-0.5 text-[11px]">
              Comprobante{' '}
              <strong className="font-mono">{facturaExistente.consecutivo}</strong>
              {facturaExistente.fechaPago && (
                <> · Pago {facturaExistente.fechaPago}</>
              )}{' '}
              · Total{' '}
              {copFmt.format(facturaExistente.totalGeneral)}
            </p>
            <p className="mt-1 text-[10px]">
              Sólo se permite una factura por cotizante por período. Para ajustes,
              anula la existente desde el Historial.
            </p>
          </div>
        </Alert>
      )}
    </section>
  );
}

function SeleccionarCC({
  periodoId,
  value,
  onChange,
}: {
  periodoId: string;
  value: string;
  onChange: (id: string, info?: { nombre: string; sub?: string } | null) => void;
}) {
  const [lista, setLista] = useState<CuentaCobroDisponible[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await listarCuentasCobroAction(periodoId, true);
      setLista(r);
    });
  }, [periodoId]);

  const filtradas = (lista ?? []).filter((c) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      c.razonSocial.toLowerCase().includes(q) ||
      c.codigo.toLowerCase().includes(q) ||
      c.sucursalCodigo.toLowerCase().includes(q)
    );
  });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-slate-400">
          Empresa CC — listado (solo sin movimiento en el período)
        </Label>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </header>
      <Input
        type="search"
        placeholder="Buscar por código, razón social o sucursal…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />
      {lista && lista.length === 0 ? (
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Todas las empresas CC ya tienen transacción en este período.</span>
        </Alert>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {filtradas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                onChange(c.id, {
                  nombre: c.razonSocial,
                  sub: `${c.sucursalCodigo} · ${c.codigo}`,
                })
              }
              className={cn(
                'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                value === c.id
                  ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div>
                <p className="font-medium text-slate-800">{c.razonSocial}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {c.sucursalCodigo} · {c.codigo}
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                {c.afiliacionesActivas} afil.
              </span>
            </button>
          ))}
          {filtradas.length === 0 && lista && (
            <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
          )}
        </div>
      )}
    </section>
  );
}

function SeleccionarAsesor({
  periodoId,
  value,
  onChange,
}: {
  periodoId: string;
  value: string;
  onChange: (id: string, info?: { nombre: string; sub?: string } | null) => void;
}) {
  const [lista, setLista] = useState<AsesorDisponible[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await listarAsesoresAction(periodoId, true);
      setLista(r);
    });
  }, [periodoId]);

  const filtrados = (lista ?? []).filter((a) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q);
  });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-slate-400">
          Asesor comercial — listado (solo sin movimiento en el período)
        </Label>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </header>
      <Input
        type="search"
        placeholder="Buscar por código o nombre…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />
      {lista && lista.length === 0 ? (
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Todos los asesores ya tienen reporte en este período.</span>
        </Alert>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {filtrados.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange(a.id, { nombre: a.nombre, sub: a.codigo })}
              className={cn(
                'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                value === a.id
                  ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div>
                <p className="font-medium text-slate-800">{a.nombre}</p>
                <p className="font-mono text-[10px] text-slate-500">{a.codigo}</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                {a.afiliacionesActivas} afil.
              </span>
            </button>
          ))}
          {filtrados.length === 0 && lista && (
            <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
          )}
        </div>
      )}
    </section>
  );
}

function TotalCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-lg font-bold tracking-tight',
          highlight ? 'text-brand-blue-dark' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}
