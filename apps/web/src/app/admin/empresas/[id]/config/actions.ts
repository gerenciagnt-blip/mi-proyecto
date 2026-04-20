'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { NivelRiesgo } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { NivelRiesgoEnum } from '@/lib/validations';

export type ActionState = { error?: string; ok?: boolean };

export async function updateEmpresaConfigAction(
  empresaId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  // Niveles (enum)
  const selectedNiveles = formData
    .getAll('nivel')
    .map((v) => String(v))
    .filter((v): v is NivelRiesgo => NivelRiesgoEnum.safeParse(v).success) as NivelRiesgo[];

  // Actividades
  const selectedActividades = formData.getAll('actividadId').map(String);

  // Tipos cotizante
  const selectedTipos = new Set(formData.getAll('tipoId').map(String));

  // Subtipos — solo contar los cuyo tipo padre esté seleccionado (validación servidor)
  const allSubtiposSelected = formData.getAll('subtipoId').map(String);
  const subtiposInfo = allSubtiposSelected.length
    ? await prisma.subtipo.findMany({
        where: { id: { in: allSubtiposSelected } },
        select: { id: true, tipoCotizanteId: true },
      })
    : [];
  const selectedSubtipos = subtiposInfo
    .filter((s) => selectedTipos.has(s.tipoCotizanteId))
    .map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    // Reemplazo simple (wipe + re-insert) — pocas filas por empresa
    await tx.empresaNivelRiesgo.deleteMany({ where: { empresaId } });
    await tx.empresaActividad.deleteMany({ where: { empresaId } });
    await tx.empresaTipoCotizante.deleteMany({ where: { empresaId } });
    await tx.empresaSubtipoCotizante.deleteMany({ where: { empresaId } });

    if (selectedNiveles.length) {
      await tx.empresaNivelRiesgo.createMany({
        data: selectedNiveles.map((nivel) => ({ empresaId, nivel })),
      });
    }
    if (selectedActividades.length) {
      await tx.empresaActividad.createMany({
        data: selectedActividades.map((actividadEconomicaId) => ({
          empresaId,
          actividadEconomicaId,
        })),
      });
    }
    if (selectedTipos.size) {
      await tx.empresaTipoCotizante.createMany({
        data: [...selectedTipos].map((tipoCotizanteId) => ({ empresaId, tipoCotizanteId })),
      });
    }
    if (selectedSubtipos.length) {
      await tx.empresaSubtipoCotizante.createMany({
        data: selectedSubtipos.map((subtipoId) => ({ empresaId, subtipoId })),
      });
    }
  });

  revalidatePath(`/admin/empresas/${empresaId}/config`);
  revalidatePath(`/admin/empresas/${empresaId}`);
  return { ok: true };
}
