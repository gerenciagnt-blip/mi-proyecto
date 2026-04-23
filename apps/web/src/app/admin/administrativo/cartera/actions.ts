'use server';

import { revalidatePath } from 'next/cache';
import type { CarteraEstado } from '@pila/db';
import { prisma } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Gestión del aliado sobre una línea de cartera real. A diferencia de la
 * versión de Soporte, el aliado:
 *   - Sólo puede accionar sobre líneas ya promovidas a CARTERA_REAL o
 *     PAGADA_CARTERA_REAL (Soporte promueve; el aliado responde).
 *   - Sólo puede tocar líneas asignadas a su sucursal.
 *   - Puede marcar como PAGADA_CARTERA_REAL (confirma que pagó) o volver
 *     a CARTERA_REAL si canceló el pago.
 *   - No puede reasignar sucursal.
 *
 * La gestión queda registrada con `accionadaPor=ALIADO`; Soporte la ve en
 * el detalle del consolidado.
 */
export async function gestionarCarteraAliadoAction(
  detalladoId: string,
  params: {
    descripcion: string;
    marcarPagada?: boolean;
  },
): Promise<ActionState> {
  const session = await requireAdmin();
  const userId = session.user.id;
  const userName = session.user.name;

  const desc = params.descripcion.trim();
  if (!desc) return { error: 'La descripción es obligatoria' };

  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  const linea = await prisma.carteraDetallado.findUnique({
    where: { id: detalladoId },
    select: {
      id: true,
      estado: true,
      sucursalAsignadaId: true,
      consolidadoId: true,
    },
  });
  if (!linea) return { error: 'Línea no encontrada' };

  // Scope: SUCURSAL sólo gestiona sus líneas.
  if (
    scope.tipo === 'SUCURSAL' &&
    linea.sucursalAsignadaId !== scope.sucursalId
  ) {
    return { error: 'No tienes permiso sobre esta línea' };
  }

  // Estado previo válido: sólo sobre cartera real (ya promovida por Soporte).
  if (
    linea.estado !== 'CARTERA_REAL' &&
    linea.estado !== 'PAGADA_CARTERA_REAL'
  ) {
    return {
      error:
        'Esta línea aún no es cartera real — Soporte debe confirmarla antes de poder gestionarla.',
    };
  }

  // Determinar nuevo estado:
  //   marcarPagada=true  → PAGADA_CARTERA_REAL
  //   marcarPagada=false + estado=PAGADA → volver a CARTERA_REAL (revertir pago)
  //   undefined          → sin cambio (sólo registra nota)
  let nuevoEstado: CarteraEstado | undefined;
  if (params.marcarPagada === true && linea.estado === 'CARTERA_REAL') {
    nuevoEstado = 'PAGADA_CARTERA_REAL';
  } else if (params.marcarPagada === false && linea.estado === 'PAGADA_CARTERA_REAL') {
    nuevoEstado = 'CARTERA_REAL';
  }

  await prisma.$transaction(async (tx) => {
    if (nuevoEstado) {
      await tx.carteraDetallado.update({
        where: { id: detalladoId },
        data: { estado: nuevoEstado },
      });
    }
    await tx.carteraGestion.create({
      data: {
        detalladoId,
        accionadaPor: 'ALIADO',
        nuevoEstado: nuevoEstado ?? null,
        descripcion: desc,
        userId,
        userName,
      },
    });
  });

  revalidatePath('/admin/administrativo/cartera');
  revalidatePath('/admin/soporte/cartera');
  return { ok: true };
}
