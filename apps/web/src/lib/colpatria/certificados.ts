/**
 * Sprint 8.6 — Certificado de afiliación vigente.
 *
 * Lógica de negocio para solicitar (cola) y servir (descarga) el
 * certificado emitido por el Portal ARL AXA. Sin retención: cada vez
 * que un usuario lo pide se crea un job nuevo; el PDF se borra apenas
 * se entrega.
 *
 * Las server actions y los endpoints son thin wrappers sobre estas
 * funciones — toda la validación (permisos, elegibilidad, scoping de
 * sucursal) vive acá para mantenerlo testeable y reusable.
 */
import { prisma, type Role } from '@pila/db';
import { dispararBotColpatria } from './dispatch';

/**
 * Modalidad y estado en los que la afiliación es elegible para
 * descargar certificado. Espejo de las condiciones que disparan los
 * jobs de afiliación (`disparos.ts`): solo DEPENDIENTE + ACTIVA, en
 * empresas con bot activo y ARL=Colpatria.
 */
type AfiliacionParaCertificado = {
  id: string;
  estado: string;
  modalidad: string;
  empresa: {
    id: string;
    colpatriaActivo: boolean;
    arl: { codigoMinSalud: string | null; nombre: string } | null;
  } | null;
};

export type ElegibilidadResult = { ok: true; empresaId: string } | { ok: false; error: string };

export function evaluarElegibilidad(af: AfiliacionParaCertificado): ElegibilidadResult {
  if (!af.empresa) {
    return { ok: false, error: 'La afiliación no tiene empresa planilla asignada' };
  }
  if (af.modalidad !== 'DEPENDIENTE') {
    return { ok: false, error: 'El certificado solo aplica a afiliaciones DEPENDIENTE' };
  }
  if (af.estado !== 'ACTIVA') {
    return { ok: false, error: 'La afiliación no está ACTIVA' };
  }
  if (!af.empresa.colpatriaActivo) {
    return {
      ok: false,
      error: 'La empresa no tiene activa la integración con Colpatria ARL',
    };
  }
  // ARL Colpatria identificada por nombre (no hay código MinSalud
  // específico que el código corra contra). Tolerante a variaciones
  // típicas (Colpatria, AXA Colpatria, Seguros de Vida Colpatria…).
  const arlNombre = (af.empresa.arl?.nombre ?? '').toUpperCase();
  if (!arlNombre.includes('COLPATRIA')) {
    return { ok: false, error: 'La ARL de la empresa no es Colpatria' };
  }
  return { ok: true, empresaId: af.empresa.id };
}

/**
 * Devuelve el sucursalId al que pertenece la afiliación, mirando al
 * cotizante (modelo multi-tenant: cada cotizante vive en una sucursal).
 * Retorna null si no se puede resolver.
 */
async function sucursalDeAfiliacion(afiliacionId: string): Promise<string | null> {
  const af = await prisma.afiliacion.findUnique({
    where: { id: afiliacionId },
    select: { cotizante: { select: { sucursalId: true } } },
  });
  return af?.cotizante.sucursalId ?? null;
}

/**
 * Verifica que un usuario tenga acceso a una afiliación.
 * STAFF (ADMIN/SOPORTE) ve todo cross-sucursal. ALIADO_OWNER y
 * ALIADO_USER solo su sucursal.
 */
export async function usuarioPuedeVerAfiliacion(
  afiliacionId: string,
  user: { role: Role; sucursalId: string | null },
): Promise<boolean> {
  if (user.role === 'ADMIN' || user.role === 'SOPORTE') return true;
  const suc = await sucursalDeAfiliacion(afiliacionId);
  return suc !== null && suc === user.sucursalId;
}

export type SolicitarResult =
  | { ok: true; jobId: string; dispatch: string }
  | { ok: false; error: string };

/**
 * Crea un `ColpatriaCertificadoJob` PENDING y dispara el bot. El caller
 * (server action) ya verificó autenticación y permisos del usuario.
 *
 * Si ya existe un job PENDING o RUNNING para la misma afiliación, NO
 * crea otro: devuelve el existente. Esto evita duplicados cuando el
 * usuario clickea dos veces el botón antes de que termine el primer
 * intento.
 */
export async function solicitarCertificado(input: {
  afiliacionId: string;
  requestedById: string;
}): Promise<SolicitarResult> {
  const af = await prisma.afiliacion.findUnique({
    where: { id: input.afiliacionId },
    select: {
      id: true,
      estado: true,
      modalidad: true,
      empresa: {
        select: {
          id: true,
          colpatriaActivo: true,
          arl: { select: { codigoMinSalud: true, nombre: true } },
        },
      },
    },
  });
  if (!af) return { ok: false, error: 'Afiliación no encontrada' };

  const eleg = evaluarElegibilidad(af);
  if (!eleg.ok) return eleg;

  // Reusar job activo si ya hay uno en cola (PENDING/RUNNING) para esta
  // misma afiliación. Evita duplicar trabajo si el usuario clica varias
  // veces el botón. El cliente igual ve el spinner avanzar al SUCCESS.
  const enCurso = await prisma.colpatriaCertificadoJob.findFirst({
    where: {
      afiliacionId: input.afiliacionId,
      status: { in: ['PENDING', 'RUNNING'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (enCurso) {
    return {
      ok: true,
      jobId: enCurso.id,
      dispatch: 'Job ya en cola — reutilizado',
    };
  }

  const job = await prisma.colpatriaCertificadoJob.create({
    data: {
      afiliacionId: input.afiliacionId,
      empresaId: eleg.empresaId,
      requestedById: input.requestedById,
      status: 'PENDING',
    },
    select: { id: true },
  });

  const dispatch = await dispararBotColpatria({
    comando: 'descargar-certificados',
    workflowFile: 'bot-colpatria-certificados.yml',
    spawnArgs: ['--limite', '5'],
  });

  return { ok: true, jobId: job.id, dispatch: dispatch.message };
}
