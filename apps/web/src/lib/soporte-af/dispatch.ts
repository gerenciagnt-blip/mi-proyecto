import { Prisma, prisma, type SoporteAfTipoDisparo } from '@pila/db';
import { nextSoporteAfConsecutivo } from './consecutivo';
import { detectarDisparos, type AfiliacionSnapshot } from './disparos';

/**
 * Dispara (si corresponde) una solicitud de Soporte · Afiliaciones al
 * terminar una creación o edición de Afiliacion en Base de Datos.
 *
 * Requisitos:
 * - Ejecutar DESPUÉS del commit principal (la afiliación ya existe).
 * - El autor (createdById) se pasa explícitamente para no depender de
 *   auth() aquí (facilita testing).
 *
 * No lanza errores al caller: loggea y retorna null si falla, para no
 * romper la experiencia de guardado ante un problema secundario.
 */
export async function dispararSoporteAfiliacion(params: {
  afiliacionId: string;
  antes: AfiliacionSnapshot | null;
  despues: AfiliacionSnapshot;
  autorUserId: string | null;
}): Promise<{ id: string; consecutivo: string; disparos: SoporteAfTipoDisparo[] } | null> {
  const disparos = detectarDisparos(params.antes, params.despues);
  if (disparos.length === 0) return null;

  try {
    // Cargar contexto de la afiliación (cotizante/sucursal/plan/modalidad/regimen)
    const af = await prisma.afiliacion.findUnique({
      where: { id: params.afiliacionId },
      select: {
        id: true,
        cotizanteId: true,
        modalidad: true,
        regimen: true,
        planSgssId: true,
        cotizante: { select: { sucursalId: true } },
        planSgss: { select: { nombre: true } },
      },
    });
    if (!af || !af.cotizante.sucursalId) return null;

    // Periodo contable vigente (best-effort — si no hay abierto, queda null)
    const now = new Date();
    const periodo = await prisma.periodoContable.findUnique({
      where: { anio_mes: { anio: now.getFullYear(), mes: now.getMonth() + 1 } },
      select: { id: true },
    });

    const consecutivo = await nextSoporteAfConsecutivo();

    const snapshotAntes: Prisma.InputJsonValue | typeof Prisma.JsonNull = params.antes
      ? (params.antes as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    const created = await prisma.soporteAfiliacion.create({
      data: {
        consecutivo,
        afiliacionId: af.id,
        cotizanteId: af.cotizanteId,
        sucursalId: af.cotizante.sucursalId,
        createdById: params.autorUserId,
        disparos,
        snapshotAntes,
        snapshotDespues: params.despues as unknown as Prisma.InputJsonValue,
        modalidadSnap: af.modalidad,
        planNombreSnap: af.planSgss?.nombre ?? null,
        regimenSnap: af.regimen ?? null,
        periodoId: periodo?.id ?? null,
        estado: 'EN_PROCESO',
      },
      select: { id: true, consecutivo: true, disparos: true },
    });
    return created;
  } catch (e) {
    console.error('[soporte-af/dispatch] fallo al crear solicitud:', e);
    return null;
  }
}
