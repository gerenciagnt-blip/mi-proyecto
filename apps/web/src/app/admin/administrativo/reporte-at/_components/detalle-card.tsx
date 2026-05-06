import type { ReporteATCausa, ReporteATEstado } from '@pila/db';
import { cn } from '@/lib/utils';
import {
  CAUSA_LABEL,
  ESTADO_LABEL,
  ESTADO_TONE,
  LATERALIDAD_LABEL,
  TIPO_DOC_AT_LABEL,
  type Lateralidad,
  type PartesCuerpoItem,
} from '@/lib/reporte-at/validations';

/**
 * Render compartido del detalle del Reporte AT — usado en la vista del
 * aliado (Administrativo) y en la vista de Soporte. Stateless: las
 * acciones (cambio de estado, notas) las inyecta el caller debajo.
 */
export function ReporteAtDetalleCard({
  r,
}: {
  r: {
    consecutivo: string;
    estado: ReporteATEstado;
    fechaRadicacion: Date;
    fechaAccidente: Date;
    diaSemanaAccidente: string | null;
    horaAccidente: string;
    horaInicioJornada: string;
    lugar: string;
    ciudadAccidente: string;
    departamentoAccidente: string;
    trabajadorNombre: string;
    trabajadorTipoDoc: string;
    trabajadorNumeroDoc: string;
    trabajadorFondoPension: string | null;
    trabajadorEps: string | null;
    trabajadorCargo: string;
    trabajadorExperienciaMeses: number | null;
    trabajadorTelefono: string | null;
    trabajadorDireccion: string | null;
    trabajadorCiudadResidencia: string | null;
    trabajadorEstadoCivil: string | null;
    trabajadorEdad: number | null;
    empresaRazonSocial: string;
    empresaNit: string;
    hechosQueOcurrio: string;
    hechosCuandoDonde: string;
    hechosComoOcurrio: string;
    causas: ReporteATCausa[];
    causasOtros: string | null;
    partesCuerpo: unknown;
    responsableNombre: string;
    responsableTelefono: string;
    responsableCorreo: string;
    responsable2Nombre: string | null;
    responsable2Telefono: string | null;
    responsable2Correo: string | null;
    trabajadorCorreoFirma: string | null;
    fechaElaboracion: Date;
    sucursal: { codigo: string; nombre: string };
  };
}) {
  const partes = parsePartes(r.partesCuerpo);
  const tipoDocLabel =
    TIPO_DOC_AT_LABEL[r.trabajadorTipoDoc as keyof typeof TIPO_DOC_AT_LABEL] ?? r.trabajadorTipoDoc;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="font-mono text-xs font-semibold text-slate-500">{r.consecutivo}</p>
          <h2 className="mt-0.5 font-heading text-lg font-semibold text-slate-900">
            {r.trabajadorNombre}
          </h2>
          <p className="text-xs text-slate-500">
            {tipoDocLabel} · {r.trabajadorNumeroDoc} · {r.empresaRazonSocial}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              ESTADO_TONE[r.estado],
            )}
          >
            {ESTADO_LABEL[r.estado]}
          </span>
          <p className="text-[10px] text-slate-400">
            Radicado {r.fechaRadicacion.toLocaleDateString('es-CO')} · {r.sucursal.codigo}
          </p>
        </div>
      </div>

      {/* Datos accidente */}
      <Section title="Datos del accidente">
        <Pair label="Fecha" value={r.fechaAccidente.toISOString().slice(0, 10)} />
        <Pair label="Día de la semana" value={r.diaSemanaAccidente ?? '—'} />
        <Pair label="Hora del accidente" value={r.horaAccidente} />
        <Pair label="Hora inicio jornada" value={r.horaInicioJornada} />
        <Pair label="Lugar" value={r.lugar} className="md:col-span-2" />
        <Pair
          label="Ciudad y departamento"
          value={`${r.ciudadAccidente} · ${r.departamentoAccidente}`}
          className="md:col-span-2"
        />
      </Section>

      {/* Datos trabajador */}
      <Section title="Trabajador">
        <Pair label="Nombre completo" value={r.trabajadorNombre} className="md:col-span-2" />
        <Pair label="Documento" value={`${r.trabajadorTipoDoc} ${r.trabajadorNumeroDoc}`} />
        <Pair label="Cargo" value={r.trabajadorCargo} />
        <Pair label="EPS" value={r.trabajadorEps ?? '—'} />
        <Pair label="Fondo de pensión" value={r.trabajadorFondoPension ?? '—'} />
        <Pair
          label="Experiencia en el cargo"
          value={
            r.trabajadorExperienciaMeses != null ? `${r.trabajadorExperienciaMeses} meses` : '—'
          }
        />
        <Pair label="Teléfono" value={r.trabajadorTelefono ?? '—'} />
        <Pair label="Edad" value={r.trabajadorEdad != null ? String(r.trabajadorEdad) : '—'} />
        <Pair label="Estado civil" value={r.trabajadorEstadoCivil ?? '—'} />
        <Pair
          label="Ciudad de residencia"
          value={r.trabajadorCiudadResidencia ?? '—'}
          className="md:col-span-2"
        />
        <Pair
          label="Dirección de residencia"
          value={r.trabajadorDireccion ?? '—'}
          className="md:col-span-2"
        />
      </Section>

      {/* Empresa */}
      <Section title="Empresa">
        <Pair label="Razón social" value={r.empresaRazonSocial} className="md:col-span-2" />
        <Pair label="NIT" value={r.empresaNit} />
      </Section>

      {/* Hechos */}
      <Section title="Hechos">
        <Block label="¿Qué ocurrió?" text={r.hechosQueOcurrio} />
        <Block label="¿Cuándo y dónde?" text={r.hechosCuandoDonde} />
        <Block label="¿Cómo ocurrió?" text={r.hechosComoOcurrio} />
      </Section>

      {/* Causas */}
      <Section title="Causas marcadas">
        {r.causas.length === 0 ? (
          <p className="md:col-span-2 text-xs text-slate-500">Sin causas marcadas.</p>
        ) : (
          <ul className="md:col-span-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {r.causas.map((c) => (
              <li
                key={c}
                className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
              >
                {CAUSA_LABEL[c]}
              </li>
            ))}
          </ul>
        )}
        {r.causasOtros && <Block label="Otros (especifica)" text={r.causasOtros} />}
      </Section>

      {/* Partes del cuerpo */}
      <Section title="Partes del cuerpo afectadas">
        {partes.length === 0 ? (
          <p className="md:col-span-2 text-xs text-slate-500">Sin partes registradas.</p>
        ) : (
          <ul className="md:col-span-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {partes.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
              >
                <span>{p.parte}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {LATERALIDAD_LABEL[p.lateralidad as Lateralidad] ?? p.lateralidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Responsables */}
      <Section title="Responsable(s) del reporte">
        <Pair label="Nombre" value={r.responsableNombre} />
        <Pair label="Teléfono" value={r.responsableTelefono} />
        <Pair label="Correo" value={r.responsableCorreo} className="md:col-span-2" />
        {(r.responsable2Nombre || r.responsable2Telefono || r.responsable2Correo) && (
          <>
            <Pair label="Nombre (2)" value={r.responsable2Nombre ?? '—'} />
            <Pair label="Teléfono (2)" value={r.responsable2Telefono ?? '—'} />
            <Pair
              label="Correo (2)"
              value={r.responsable2Correo ?? '—'}
              className="md:col-span-2"
            />
          </>
        )}
      </Section>

      <Section title="Firma del trabajador">
        <Pair
          label="Correo electrónico"
          value={r.trabajadorCorreoFirma ?? '—'}
          className="md:col-span-3"
        />
      </Section>

      <p className="text-right text-[10px] text-slate-400">
        Reporte elaborado el {r.fechaElaboracion.toISOString().slice(0, 10)}
      </p>
    </div>
  );
}

// =====================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wider text-slate-700">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">{children}</dl>
    </section>
  );
}

function Pair({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className ?? ''}>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="md:col-span-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-200">
        {text}
      </dd>
    </div>
  );
}

function parsePartes(raw: unknown): PartesCuerpoItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map((it) => {
        if (typeof it !== 'object' || it === null) return null;
        const obj = it as { parte?: unknown; lateralidad?: unknown };
        if (typeof obj.parte !== 'string') return null;
        const lat: Lateralidad =
          obj.lateralidad === 'DERECHA' ||
          obj.lateralidad === 'IZQUIERDA' ||
          obj.lateralidad === 'AMBAS' ||
          obj.lateralidad === 'NA'
            ? obj.lateralidad
            : 'NA';
        return { parte: obj.parte, lateralidad: lat };
      })
      .filter((x): x is PartesCuerpoItem => x !== null);
  }
  return [];
}
