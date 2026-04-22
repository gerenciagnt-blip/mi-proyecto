'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  Plus,
  Search,
  User,
  Building2,
  Users2,
  FileText,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  buscarCotizanteAction,
  listarCuentasCobroSinMovimientoAction,
  listarAsesoresSinMovimientoAction,
  crearTransaccionAction,
  type TipoTransaccion,
  type CotizanteEncontrado,
  type CuentaCobroDisponible,
  type AsesorDisponible,
} from './actions';

const TIPOS: Array<{
  id: TipoTransaccion;
  label: string;
  desc: string;
  icon: typeof User;
}> = [
  {
    id: 'INDIVIDUAL',
    label: 'Individual',
    desc: 'Mensualidad de un cotizante (por documento)',
    icon: User,
  },
  {
    id: 'VINCULACION',
    label: 'Vinculación',
    desc: 'Afiliación — cobro administrativo (por documento)',
    icon: FileText,
  },
  {
    id: 'EMPRESA_CC',
    label: 'Empresa CC',
    desc: 'Mensualidad agrupada por cuenta de cobro',
    icon: Building2,
  },
  {
    id: 'ASESOR',
    label: 'Asesor',
    desc: 'Reporte informativo por asesor comercial',
    icon: Users2,
  },
];

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

type Props = {
  periodoId: string;
  periodoLabel: string;
  disabled?: boolean;
};

export function NuevaTransaccionDialog({ periodoId, periodoLabel, disabled }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="gradient" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="h-4 w-4" />
        <span>Nueva transacción</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva transacción"
        description={`Emisión individual · Período ${periodoLabel}`}
        size="lg"
      >
        <NuevaTransaccionForm
          periodoId={periodoId}
          onSuccess={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function NuevaTransaccionForm({
  periodoId,
  onSuccess,
}: {
  periodoId: string;
  onSuccess: () => void;
}) {
  const [tipo, setTipo] = useState<TipoTransaccion>('INDIVIDUAL');
  return (
    <div className="space-y-4">
      {/* Selector de tipo */}
      <section>
        <Label>Tipo de transacción</Label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TIPOS.map((t) => {
            const Icon = t.icon;
            const active = tipo === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-left transition',
                  active
                    ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    active ? 'text-brand-blue' : 'text-slate-400',
                  )}
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      active ? 'text-brand-blue-dark' : 'text-slate-700',
                    )}
                  >
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sección del destinatario según el tipo */}
      {(tipo === 'INDIVIDUAL' || tipo === 'VINCULACION') && (
        <BuscarCotizante
          periodoId={periodoId}
          tipo={tipo}
          onSuccess={onSuccess}
        />
      )}
      {tipo === 'EMPRESA_CC' && (
        <SeleccionarCC periodoId={periodoId} onSuccess={onSuccess} />
      )}
      {tipo === 'ASESOR' && (
        <SeleccionarAsesor periodoId={periodoId} onSuccess={onSuccess} />
      )}
    </div>
  );
}

// ========== Individual / Vinculación ==========

function BuscarCotizante({
  periodoId,
  tipo,
  onSuccess,
}: {
  periodoId: string;
  tipo: Extract<TipoTransaccion, 'INDIVIDUAL' | 'VINCULACION'>;
  onSuccess: () => void;
}) {
  const [doc, setDoc] = useState('');
  const [tipoDoc, setTipoDoc] = useState('CC');
  const [pendingBuscar, startBuscar] = useTransition();
  const [result, setResult] = useState<CotizanteEncontrado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAfId, setSelectedAfId] = useState<string>('');

  const buscar = () => {
    setError(null);
    setResult(null);
    setSelectedAfId('');
    startBuscar(async () => {
      const r = await buscarCotizanteAction(doc, periodoId);
      if (r.error) {
        setError(r.error);
      } else if (r.found) {
        setResult(r.found);
        // Autoseleccionar primera afiliación activa
        const activa = r.found.afiliaciones.find((a) => a.estado === 'ACTIVA');
        if (activa) setSelectedAfId(activa.id);
      }
    });
  };

  const existeEnPeriodo = result?.comprobantesPeriodo.some(
    (c) =>
      (tipo === 'VINCULACION' && c.tipo === 'AFILIACION') ||
      (tipo === 'INDIVIDUAL' && c.tipo === 'MENSUALIDAD'),
  );

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <header>
        <p className="text-sm font-medium text-slate-700">Buscar cotizante</p>
        <p className="text-[11px] text-slate-500">Ingresa el número de documento</p>
      </header>

      <div className="flex gap-2">
        <select
          value={tipoDoc}
          onChange={(e) => setTipoDoc(e.target.value)}
          className="h-10 rounded-xl border border-brand-border bg-brand-surface px-3 text-sm"
        >
          <option value="CC">CC</option>
          <option value="CE">CE</option>
          <option value="TI">TI</option>
          <option value="PAS">PAS</option>
          <option value="NIT">NIT</option>
        </select>
        <Input
          type="text"
          value={doc}
          onChange={(e) => setDoc(e.target.value.toUpperCase())}
          placeholder="Ej. 1088002872"
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
          disabled={pendingBuscar || !doc.trim()}
        >
          {pendingBuscar ? (
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
          {/* Header del cotizante */}
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-900">{result.cotizante.nombreCompleto}</p>
            <p className="font-mono text-xs text-slate-500">
              {result.cotizante.tipoDocumento} {result.cotizante.numeroDocumento}
            </p>
          </div>

          {/* Afiliaciones */}
          {result.afiliaciones.length === 0 ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>El cotizante no tiene afiliaciones registradas</span>
            </Alert>
          ) : (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Afiliación
              </p>
              <div className="space-y-1.5">
                {result.afiliaciones.map((a) => {
                  const active = selectedAfId === a.id;
                  const disabled = a.estado !== 'ACTIVA';
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedAfId(a.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                        disabled && 'cursor-not-allowed opacity-50',
                        active
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
                          {a.modalidad} · Nivel {a.nivelRiesgo} · Ingreso {a.fechaIngreso} ·{' '}
                          Salario {copFmt.format(a.salario)}
                        </p>
                      </div>
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
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aviso si ya existe comprobante del mismo tipo */}
          {existeEnPeriodo && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Ya existe un comprobante del mismo tipo para este cotizante en el período. Si
                continúas se creará otro.
              </span>
            </Alert>
          )}

          {/* Submit */}
          {selectedAfId && (
            <SubmitTransaccion
              input={{ periodoId, tipo, afiliacionId: selectedAfId }}
              onSuccess={onSuccess}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ========== Empresa CC ==========

function SeleccionarCC({
  periodoId,
  onSuccess,
}: {
  periodoId: string;
  onSuccess: () => void;
}) {
  const [lista, setLista] = useState<CuentaCobroDisponible[] | null>(null);
  const [seleccionada, setSeleccionada] = useState<string>('');
  const [filtro, setFiltro] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await listarCuentasCobroSinMovimientoAction(periodoId);
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
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <header>
        <p className="text-sm font-medium text-slate-700">Empresas CC sin movimiento</p>
        <p className="text-[11px] text-slate-500">
          Solo aparecen las que aún no tienen comprobante en el período
        </p>
      </header>

      {pending ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Cargando…</span>
        </div>
      ) : lista && lista.length === 0 ? (
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Todas las empresas CC ya tienen comprobante en este período.</span>
        </Alert>
      ) : (
        <>
          <Input
            type="search"
            placeholder="Buscar por código, razón social o sucursal…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {filtradas.map((c) => {
              const active = seleccionada === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSeleccionada(c.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                    active
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
                    {c.afiliacionesActivas}{' '}
                    {c.afiliacionesActivas === 1 ? 'afiliación' : 'afiliaciones'}
                  </span>
                </button>
              );
            })}
            {filtradas.length === 0 && (
              <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
            )}
          </div>

          {seleccionada && (
            <SubmitTransaccion
              input={{ periodoId, tipo: 'EMPRESA_CC', cuentaCobroId: seleccionada }}
              onSuccess={onSuccess}
            />
          )}
        </>
      )}
    </section>
  );
}

// ========== Asesor ==========

function SeleccionarAsesor({
  periodoId,
  onSuccess,
}: {
  periodoId: string;
  onSuccess: () => void;
}) {
  const [lista, setLista] = useState<AsesorDisponible[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<string>('');
  const [filtro, setFiltro] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await listarAsesoresSinMovimientoAction(periodoId);
      setLista(r);
    });
  }, [periodoId]);

  const filtrados = (lista ?? []).filter((a) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q)
    );
  });

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <header>
        <p className="text-sm font-medium text-slate-700">Asesores sin movimiento</p>
        <p className="text-[11px] text-slate-500">
          Solo aparecen los que aún no tienen reporte en el período
        </p>
      </header>

      {pending ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Cargando…</span>
        </div>
      ) : lista && lista.length === 0 ? (
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Todos los asesores ya tienen reporte en este período.</span>
        </Alert>
      ) : (
        <>
          <Input
            type="search"
            placeholder="Buscar por código o nombre…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {filtrados.map((a) => {
              const active = seleccionado === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSeleccionado(a.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border p-2.5 text-left text-xs transition',
                    active
                      ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <div>
                    <p className="font-medium text-slate-800">{a.nombre}</p>
                    <p className="font-mono text-[10px] text-slate-500">{a.codigo}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {a.afiliacionesActivas}{' '}
                    {a.afiliacionesActivas === 1 ? 'afiliación' : 'afiliaciones'}
                  </span>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
            )}
          </div>

          {seleccionado && (
            <SubmitTransaccion
              input={{ periodoId, tipo: 'ASESOR', asesorComercialId: seleccionado }}
              onSuccess={onSuccess}
            />
          )}
        </>
      )}
    </section>
  );
}

// ========== Submit ==========

function SubmitTransaccion({
  input,
  onSuccess,
}: {
  input: Parameters<typeof crearTransaccionAction>[0];
  onSuccess: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ consecutivo: string; total: number } | null>(null);

  const onSubmit = () => {
    setError(null);
    setExito(null);
    start(async () => {
      const r = await crearTransaccionAction(input);
      if (r.error) {
        setError(r.error);
      } else if (r.ok && r.consecutivo) {
        setExito({ consecutivo: r.consecutivo, total: r.totalGeneral ?? 0 });
        setTimeout(onSuccess, 1500);
      }
    });
  };

  if (exito) {
    return (
      <Alert variant="success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Comprobante <strong className="font-mono">{exito.consecutivo}</strong> creado ·{' '}
          Total {copFmt.format(exito.total)}
        </span>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="gradient"
          onClick={onSubmit}
          disabled={pending}
        >
          <Save className="h-4 w-4" />
          {pending ? 'Creando…' : 'Crear transacción'}
        </Button>
      </div>
    </div>
  );
}
