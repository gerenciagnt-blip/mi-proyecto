'use server';

/**
 * Server actions para sincronizar aportantes con PagoSimple de forma manual.
 *
 * Manual por diseño:
 *   - Permite al operador decidir CUÁNDO sincronizar (ej. después de llenar
 *     todos los campos requeridos).
 *   - Si falla por datos faltantes, se muestra un mensaje claro y el resto
 *     de la app sigue funcionando sin atar la creación de Empresas a
 *     la disponibilidad de la API externa.
 *
 * En una fase futura (PS-B.next) podremos engancharlas también a los
 * createEmpresaAction / createAfiliacionAction para auto-sync.
 */

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-helpers';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';
import {
  syncEmpresaAsContributor,
  syncCotizanteIndependienteAsContributor,
  type SyncEmpresaResult,
  type SyncCotizanteResult,
} from '@/lib/pagosimple/aportantes';

/**
 * Sincroniza la empresa indicada con PagoSimple (crear o actualizar según
 * tenga ya `pagosimpleContributorId`). Solo staff.
 */
export async function sincronizarEmpresaPagosimpleAction(
  empresaId: string,
): Promise<SyncEmpresaResult> {
  await requireStaff();

  if (!isPagosimpleEnabled()) {
    return {
      ok: false,
      error:
        'La integración con PagoSimple no está configurada. Define las variables PAGOSIMPLE_* en .env.',
    };
  }

  const res = await syncEmpresaAsContributor(empresaId);
  if (res.ok) {
    revalidatePath(`/admin/empresas/${empresaId}`);
    revalidatePath('/admin/empresas');
  }
  return res;
}

/**
 * Sincroniza el cotizante INDEPENDIENTE indicado con PagoSimple. Solo staff.
 */
export async function sincronizarCotizantePagosimpleAction(
  cotizanteId: string,
): Promise<SyncCotizanteResult> {
  await requireStaff();

  if (!isPagosimpleEnabled()) {
    return {
      ok: false,
      error:
        'La integración con PagoSimple no está configurada. Define las variables PAGOSIMPLE_* en .env.',
    };
  }

  const res = await syncCotizanteIndependienteAsContributor(cotizanteId);
  if (res.ok) {
    revalidatePath('/admin/base-datos');
  }
  return res;
}
