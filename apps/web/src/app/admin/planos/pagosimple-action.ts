'use server';

/**
 * Server actions para el flujo PagoSimple sobre planillas.
 *
 * Los 3 pasos son secuenciales; cada uno tiene su propia action para que
 * la UI pueda mostrar feedback discreto en cada transición:
 *
 *   subir → validar → pagar
 *
 * Todas requieren staff. Los aliados (SUCURSAL) NO disparan estas
 * acciones — solo ven el estado. Enviar un plano al operador es una
 * acción administrativa.
 */

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-helpers';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';
import {
  uploadPlanillaToPagosimple,
  validatePlanillaInPagosimple,
  getPlanillaPaymentUrlFromPagosimple,
  getPlanillaInconsistenciesFromPagosimple,
  type UploadPlanillaResult,
  type ValidatePlanillaResult,
  type PaymentUrlResult,
  type InconsistenciesResult,
} from '@/lib/pagosimple/planillas';

const CONFIG_ERR = {
  ok: false as const,
  error:
    'La integración con PagoSimple no está configurada. Define las variables PAGOSIMPLE_* en .env.',
};

/**
 * Paso 1/3: sube el plano al operador. Persiste el `payroll_number`
 * devuelto en `planilla.pagosimpleNumero`.
 */
export async function subirPlanillaPagosimpleAction(
  planillaId: string,
): Promise<UploadPlanillaResult> {
  await requireStaff();
  if (!isPagosimpleEnabled()) return CONFIG_ERR;

  const res = await uploadPlanillaToPagosimple(planillaId);
  if (res.ok) revalidatePath('/admin/planos');
  return res;
}

/**
 * Paso 2/3: dispara las validaciones del operador sobre el plano ya
 * subido. Guarda el `validation_status` (OK/WARNING/ERROR).
 */
export async function validarPlanillaPagosimpleAction(
  planillaId: string,
): Promise<ValidatePlanillaResult> {
  await requireStaff();
  if (!isPagosimpleEnabled()) return CONFIG_ERR;

  const res = await validatePlanillaInPagosimple(planillaId);
  if (res.ok) revalidatePath('/admin/planos');
  return res;
}

/**
 * Paso 3/3: obtiene la URL PSE para que el usuario pague en una nueva
 * pestaña. Si ya la pedimos antes, retorna la cacheada.
 */
export async function obtenerPagoPsePagosimpleAction(
  planillaId: string,
  force = false,
): Promise<PaymentUrlResult> {
  await requireStaff();
  if (!isPagosimpleEnabled()) return CONFIG_ERR;

  const res = await getPlanillaPaymentUrlFromPagosimple(planillaId, { force });
  if (res.ok) revalidatePath('/admin/planos');
  return res;
}

/**
 * Diagnóstico: lista las inconsistencias (errores de contribuyente,
 * empresa y warnings) que el validate detectó. Se usa en el dialog de
 * detalle cuando el estado es ERROR/WARNING.
 */
export async function inconsistenciasPlanillaPagosimpleAction(
  planillaId: string,
): Promise<InconsistenciesResult> {
  await requireStaff();
  if (!isPagosimpleEnabled()) return CONFIG_ERR;

  return getPlanillaInconsistenciesFromPagosimple(planillaId);
}
