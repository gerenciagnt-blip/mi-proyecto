'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Lock, Plus, Pencil, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import type { DeptoOpt } from './empresa-fields';
import { CreateEmpresaForm } from './create-form';
import { EditEmpresaForm } from './[id]/edit-form';
import { ConfigForm } from './[id]/config/config-form';
import { ColpatriaForm } from './[id]/colpatria/colpatria-form';
import { ConfigBotForm } from './[id]/colpatria/config-bot-form';
import { CentrosTrabajoForm } from './[id]/colpatria/centros-trabajo-form';
import { obtenerEstadoEmpresa } from './actions';
import {
  obtenerEstadoColpatria,
  obtenerCentrosTrabajo,
  type ColpatriaConfigEstado,
  type CentroTrabajoMapeo,
} from './[id]/colpatria/actions';

type Arl = { id: string; codigo: string; nombre: string };

/** Datos catálogo que el modal recibe pre-cargados desde la lista. */
export type CatalogosModal = {
  arls: Arl[];
  departamentos: DeptoOpt[];
  niveles: ('I' | 'II' | 'III' | 'IV' | 'V')[];
  actividades: { id: string; codigoCiiu: string; descripcion: string }[];
  tipos: {
    id: string;
    codigo: string;
    nombre: string;
    modalidad: string;
    subtipos: { id: string; codigo: string; nombre: string }[];
  }[];
};

/** Empresa serializable (Date → string) tal como viene de obtenerEstadoEmpresa. */
type EmpresaSnapshot = NonNullable<Awaited<ReturnType<typeof obtenerEstadoEmpresa>>>;

type ModalState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'create' } // creando nueva — solo Tab 1 habilitada al inicio
  | {
      kind: 'edit';
      empresaId: string;
      snapshot: EmpresaSnapshot;
      colpatria: ColpatriaConfigEstado | null;
      centros: CentroTrabajoMapeo[];
    };

type TabId = 'basicos' | 'pila' | 'colpatria';

/**
 * Modal único para Crear y Editar empresa con 3 tabs:
 *   Tab 1 — Datos básicos (CreateEmpresaForm o EditEmpresaForm según modo)
 *   Tab 2 — Configuración PILA (ConfigForm)
 *   Tab 3 — Bot Colpatria (3 forms apilados)
 *
 * Reutiliza los componentes existentes; cada tab tiene su propio
 * submit. La "garantía de todo diligenciado" se cumple así:
 *   - Indicadores ✓/⚠ en cada tab (basados en server-side completitud)
 *   - En CREATE: Tab 2 y 3 deshabilitadas hasta que se guarde Tab 1
 *   - Al cerrar el modal con tabs incompletas, muestra warning
 *
 * Las URLs deep link `/admin/empresas/[id]`, `/config`, `/colpatria`
 * siguen funcionando (no se eliminaron).
 */
export function EmpresaTabsDialog({
  catalogos,
  trigger,
  empresaIdEdit,
}: {
  catalogos: CatalogosModal;
  /** Variante del botón disparador. */
  trigger: 'create' | 'edit';
  /** Solo cuando trigger='edit'. */
  empresaIdEdit?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ModalState>({ kind: 'closed' });
  const [activeTab, setActiveTab] = useState<TabId>('basicos');
  const [isLoading, startLoading] = useTransition();
  const [showCloseWarn, setShowCloseWarn] = useState(false);

  // Abrir modal — diferente según trigger
  const abrir = () => {
    if (trigger === 'create') {
      setState({ kind: 'create' });
      setActiveTab('basicos');
    } else if (trigger === 'edit' && empresaIdEdit) {
      cargarParaEdicion(empresaIdEdit);
    }
  };

  const cargarParaEdicion = (id: string) => {
    setState({ kind: 'loading' });
    setActiveTab('basicos');
    startLoading(async () => {
      const [estado, colpatria, centros] = await Promise.all([
        obtenerEstadoEmpresa(id),
        obtenerEstadoColpatria(id),
        obtenerCentrosTrabajo(id),
      ]);
      if (!estado) {
        setState({ kind: 'closed' });
        return;
      }
      setState({ kind: 'edit', empresaId: id, snapshot: estado, colpatria, centros });
    });
  };

  // Cierre con guard: si el modal está en CREATE y tiene empresaId
  // (Tab 1 ya guardada) pero no completó Tab 2/3, advertimos.
  const intentarCerrar = () => {
    if (state.kind === 'edit') {
      const c = state.snapshot.completitud;
      if (!c.pila || !c.colpatria) {
        setShowCloseWarn(true);
        return;
      }
    }
    cerrar();
  };

  const cerrar = () => {
    setState({ kind: 'closed' });
    setShowCloseWarn(false);
    router.refresh();
  };

  // Tras crear empresa básica, transicionamos automáticamente a EDIT
  // con el id nuevo y abrimos Tab 2.
  const onCreateSuccess = (nuevoId: string) => {
    cargarParaEdicion(nuevoId);
    // Auto-jump a Tab 2 tras la carga (cuando state cambie a 'edit')
    setTimeout(() => setActiveTab('pila'), 100);
  };

  // Refrescar el snapshot tras cualquier guardado interno (Tab 2 o 3)
  const refrescarSnapshot = () => {
    if (state.kind !== 'edit') return;
    cargarParaEdicion(state.empresaId);
  };

  const open = state.kind !== 'closed';
  const c =
    state.kind === 'edit'
      ? state.snapshot.completitud
      : { basicos: false, pila: false, colpatria: false };

  return (
    <>
      {trigger === 'create' ? (
        <Button variant="gradient" onClick={abrir}>
          <Plus className="h-4 w-4" />
          <span>Nueva empresa planilla</span>
        </Button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-dark"
        >
          <Pencil className="h-3 w-3" />
          Editar
        </button>
      )}

      <Dialog
        open={open}
        onClose={intentarCerrar}
        size="xl"
        title={
          <div className="flex items-center gap-2">
            {state.kind === 'edit' ? (
              <>
                <Pencil className="h-5 w-5 text-brand-blue" />
                <span>Editar empresa planilla</span>
                <span className="ml-2 font-mono text-xs text-slate-500">
                  · NIT {state.snapshot.empresa.nit}
                </span>
              </>
            ) : state.kind === 'create' ? (
              <>
                <Plus className="h-5 w-5 text-brand-blue" />
                <span>Nueva empresa planilla</span>
              </>
            ) : (
              <span>Cargando…</span>
            )}
          </div>
        }
      >
        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex gap-0.5 px-0.5">
            <TabButton
              id="basicos"
              label="Datos básicos"
              estado={c.basicos ? 'ok' : state.kind === 'edit' ? 'pending' : 'unset'}
              activo={activeTab === 'basicos'}
              onClick={() => setActiveTab('basicos')}
            />
            <TabButton
              id="pila"
              label="Configuración PILA"
              estado={state.kind !== 'edit' ? 'locked' : c.pila ? 'ok' : 'pending'}
              activo={activeTab === 'pila'}
              onClick={() => setActiveTab('pila')}
              disabled={state.kind !== 'edit'}
            />
            <TabButton
              id="colpatria"
              label="Bot Colpatria"
              estado={state.kind !== 'edit' ? 'locked' : c.colpatria ? 'ok' : 'pending'}
              activo={activeTab === 'colpatria'}
              onClick={() => setActiveTab('colpatria')}
              disabled={state.kind !== 'edit'}
            />
          </nav>
        </div>

        {/* Loading state */}
        {(state.kind === 'loading' || isLoading) && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-500">Cargando datos de la empresa…</p>
          </div>
        )}

        {/* Tab 1 — Datos básicos */}
        {!isLoading && state.kind === 'create' && activeTab === 'basicos' && (
          <div className="space-y-3 py-4">
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Después de crear la empresa básica vas a poder configurar PILA y Bot Colpatria sin
              cerrar este modal.
            </p>
            <CreateEmpresaForm
              arls={catalogos.arls}
              departamentos={catalogos.departamentos}
              onSuccess={(id) => id && onCreateSuccess(id)}
            />
          </div>
        )}
        {!isLoading && state.kind === 'edit' && activeTab === 'basicos' && (
          <div className="space-y-3 py-4">
            <EditEmpresaForm
              empresa={empresaSnapshotToEditForm(state.snapshot.empresa)}
              arls={catalogos.arls}
              departamentos={catalogos.departamentos}
            />
            <DeepLinkRow
              href={`/admin/empresas/${state.empresaId}`}
              label="Abrir en página completa"
            />
          </div>
        )}

        {/* Tab 2 — Configuración PILA */}
        {!isLoading && state.kind === 'edit' && activeTab === 'pila' && (
          <div className="space-y-3 py-4">
            <ConfigForm
              empresaId={state.empresaId}
              actividades={catalogos.actividades}
              tipos={catalogos.tipos}
              selectedNiveles={state.snapshot.empresa.nivelesPermitidos.map((n) => n.nivel)}
              selectedActividades={state.snapshot.empresa.actividadesPermitidas.map(
                (a) => a.actividadEconomicaId,
              )}
              selectedTipos={state.snapshot.empresa.tiposPermitidos.map((t) => t.tipoCotizanteId)}
              selectedSubtipos={state.snapshot.empresa.subtiposPermitidos.map((s) => s.subtipoId)}
              onSuccess={refrescarSnapshot}
            />
            <DeepLinkRow
              href={`/admin/empresas/${state.empresaId}/config`}
              label="Abrir configuración PILA en página completa"
            />
          </div>
        )}

        {/* Tab 3 — Bot Colpatria */}
        {!isLoading && state.kind === 'edit' && activeTab === 'colpatria' && (
          <div className="space-y-4 py-4">
            <ColpatriaForm
              empresaId={state.empresaId}
              empresaNombre={state.snapshot.empresa.nombre}
              estadoInicial={state.colpatria!}
            />
            <ConfigBotForm empresaId={state.empresaId} estadoInicial={state.colpatria!} />
            <CentrosTrabajoForm empresaId={state.empresaId} niveles={state.centros} />
            <DeepLinkRow
              href={`/admin/empresas/${state.empresaId}/colpatria`}
              label="Abrir Bot Colpatria en página completa"
            />
          </div>
        )}

        {/* Footer: estado completitud + cerrar */}
        {state.kind === 'edit' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <ResumenEstado label="Datos básicos" ok={c.basicos} />
              <ResumenEstado label="Config PILA" ok={c.pila} />
              <ResumenEstado label="Bot Colpatria" ok={c.colpatria} />
            </div>
            <Button variant="outline" size="sm" onClick={intentarCerrar}>
              {c.basicos && c.pila && c.colpatria ? 'Finalizar' : 'Cerrar'}
            </Button>
          </div>
        )}

        {/* Modal de confirmación al cerrar incompleto */}
        {showCloseWarn && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="max-w-sm rounded-lg border border-amber-200 bg-white p-4 shadow-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">Configuración incompleta</p>
                  <p className="mt-1 text-xs text-amber-800">
                    Aún hay tabs sin completar. Si cierras ahora, la empresa quedará parcialmente
                    configurada y el bot Colpatria/módulo PILA podría no funcionar correctamente.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCloseWarn(false)}>
                  Volver
                </Button>
                <Button variant="danger" size="sm" onClick={cerrar}>
                  Cerrar de todos modos
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

type EstadoTab = 'ok' | 'pending' | 'locked' | 'unset';

function TabButton({
  label,
  estado,
  activo,
  onClick,
  disabled,
}: {
  id: TabId;
  label: string;
  estado: EstadoTab;
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon =
    estado === 'ok'
      ? CheckCircle2
      : estado === 'pending'
        ? AlertCircle
        : estado === 'locked'
          ? Lock
          : null;
  const iconColor =
    estado === 'ok'
      ? 'text-emerald-600'
      : estado === 'pending'
        ? 'text-amber-600'
        : 'text-slate-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition ${
        activo
          ? 'border-brand-blue text-brand-blue-dark'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 ${iconColor}`} />}
      {label}
    </button>
  );
}

function ResumenEstado({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ok ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      ) : (
        <AlertCircle className="h-3 w-3 text-amber-500" />
      )}
      <span>{label}</span>
    </span>
  );
}

function DeepLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-brand-blue"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

/**
 * Mapea el snapshot que viene de Prisma (con tipos generados) al
 * shape que `EditEmpresaForm` espera (Empresa serializable). Convierte
 * Date a Date y nullable de fecha a Date | null.
 */
function empresaSnapshotToEditForm(e: EmpresaSnapshot['empresa']) {
  return {
    id: e.id,
    nit: e.nit,
    dv: e.dv,
    nombre: e.nombre,
    nombreComercial: e.nombreComercial,
    tipoPersona: e.tipoPersona,
    repLegalTipoDoc: e.repLegalTipoDoc,
    repLegalNumeroDoc: e.repLegalNumeroDoc,
    repLegalNombre: e.repLegalNombre,
    direccion: e.direccion,
    ciudad: e.ciudad,
    departamento: e.departamento,
    departamentoId: e.departamentoId,
    municipioId: e.municipioId,
    telefono: e.telefono,
    email: e.email,
    ciiuPrincipal: e.ciiuPrincipal,
    arlId: e.arlId,
    exoneraLey1607: e.exoneraLey1607,
    fechaInicioActividades: e.fechaInicioActividades,
    pagosimpleContributorId: e.pagosimpleContributorId,
    active: e.active,
  };
}

// Suprimir warning de import no usado
void Alert;
void X;
