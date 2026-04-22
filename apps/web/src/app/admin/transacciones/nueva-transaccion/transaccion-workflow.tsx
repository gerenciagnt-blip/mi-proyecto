'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Search,
  User,
  Building2,
  Users2,
  AlertCircle,
  Loader2,
  Receipt,
  CheckCircle2,
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

type Props = {
  periodoId: string;
  periodoLabel: string;
  periodoCerrado: boolean;
};

export function TransaccionWorkflow({
  periodoId,
  periodoLabel,
  periodoCerrado,
}: Props) {
  const [tipo, setTipo] = useState<TipoTransaccion>('INDIVIDUAL');

  // Destinatario (según tipo)
  const [afiliacionId, setAfiliacionId] = useState<string>('');
  const [cuentaCobroId, setCuentaCobroId] = useState<string>('');
  const [asesorComercialId, setAsesorComercialId] = useState<string>('');

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

  // Pre-facturar
  const [prefactOpen, setPrefactOpen] = useState(false);

  // Reset al cambiar de tipo
  useEffect(() => {
    setAfiliacionId('');
    setCuentaCobroId('');
    setAsesorComercialId('');
    setRows(null);
    setTotales(null);
    setPreviewError(null);
  }, [tipo]);

  const destinatarioListo =
    (tipo === 'INDIVIDUAL' && !!afiliacionId) ||
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
        afiliacionId: afiliacionId || undefined,
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
    afiliacionId,
    cuentaCobroId,
    asesorComercialId,
  ]);

  const onProcesado = () => {
    setPrefactOpen(false);
    // Limpiar selección para siguiente transacción
    setAfiliacionId('');
    setCuentaCobroId('');
    setAsesorComercialId('');
    setRows(null);
    setTotales(null);
  };

  const contextParaProcesar: PreviewInput = {
    periodoId,
    tipo,
    afiliacionId: afiliacionId || undefined,
    cuentaCobroId: cuentaCobroId || undefined,
    asesorComercialId: asesorComercialId || undefined,
  };

  return (
    <div className="space-y-4">
      {/* Header: período + tipo */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-slate-400">
              Período contable
            </Label>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-900">
              {periodoLabel}
            </p>
          </div>
          <div className="flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-slate-400">
              Tipo de transacción
            </Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {TIPOS.map((t) => {
                const Icon = t.icon;
                const active = tipo === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipo(t.id)}
                    disabled={periodoCerrado}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
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
          </div>
        </div>
      </section>

      {periodoCerrado && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            El período está cerrado. Reábrelo desde <strong>Cartera</strong> para emitir
            transacciones.
          </span>
        </Alert>
      )}

      {/* Selector de destinatario según tipo */}
      {!periodoCerrado && tipo === 'INDIVIDUAL' && (
        <BuscarCotizante
          onSelect={setAfiliacionId}
          afiliacionIdActual={afiliacionId}
        />
      )}
      {!periodoCerrado && tipo === 'EMPRESA_CC' && (
        <SeleccionarCC
          periodoId={periodoId}
          value={cuentaCobroId}
          onChange={setCuentaCobroId}
        />
      )}
      {!periodoCerrado && tipo === 'ASESOR' && (
        <SeleccionarAsesor
          periodoId={periodoId}
          value={asesorComercialId}
          onChange={setAsesorComercialId}
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
        />
      )}
    </div>
  );
}

// ========== Sub-selectores ==========

function BuscarCotizante({
  onSelect,
  afiliacionIdActual,
}: {
  onSelect: (id: string) => void;
  afiliacionIdActual: string;
}) {
  const [doc, setDoc] = useState('');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CotizanteEncontrado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buscar = () => {
    setError(null);
    setResult(null);
    onSelect('');
    start(async () => {
      const r = await buscarCotizanteAction(doc);
      if (r.error) setError(r.error);
      else if (r.found) {
        setResult(r.found);
        const activa = r.found.afiliaciones.find((a) => a.estado === 'ACTIVA');
        if (activa) onSelect(activa.id);
      }
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header>
        <Label className="text-[10px] uppercase tracking-wider text-slate-400">
          Buscar cotizante
        </Label>
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
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-900">{result.cotizante.nombreCompleto}</p>
            <p className="font-mono text-xs text-slate-500">
              {result.cotizante.tipoDocumento} {result.cotizante.numeroDocumento}
            </p>
          </div>

          {result.afiliaciones.length === 0 ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>El cotizante no tiene afiliaciones registradas</span>
            </Alert>
          ) : (
            <div className="space-y-1.5">
              {result.afiliaciones.map((a) => {
                const selected = afiliacionIdActual === a.id;
                const disabled = a.estado !== 'ACTIVA';
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                      disabled && 'cursor-not-allowed opacity-50',
                      selected
                        ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                        : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {a.empresaNombre ?? (
                          <span className="italic text-slate-400">
                            Sin empresa · Independiente
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {a.modalidad} · Nivel {a.nivelRiesgo} · Ingreso {a.fechaIngreso} ·
                        Salario {copFmt.format(a.salario)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected && (
                        <CheckCircle2 className="h-4 w-4 text-brand-blue" />
                      )}
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          a.estado === 'ACTIVA'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-500',
                        )}
                      >
                        {a.estado}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
  onChange: (id: string) => void;
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
              onClick={() => onChange(c.id)}
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
  onChange: (id: string) => void;
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
              onClick={() => onChange(a.id)}
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
