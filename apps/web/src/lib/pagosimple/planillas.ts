/**
 * Integración PagoSimple — flujo de planillas (API 3).
 *
 * Tres pasos secuenciales que consume la UI:
 *
 *   1. `uploadPlanillaToPagosimple(planillaId)`
 *      Sube el archivo plano generado localmente (`generarPlano`) vía
 *      multipart al endpoint `/payroll/upload`. PagoSimple devuelve un
 *      `payroll_number` que guardamos en `planilla.pagosimpleNumero`.
 *
 *   2. `validatePlanillaInPagosimple(planillaId, opts)`
 *      Llama `/payroll/validate` con el `payroll_code` para que el
 *      operador corra sus validaciones SGSS. Guarda el estado en
 *      `planilla.pagosimpleEstadoValidacion` (OK / WARNING / ERROR).
 *
 *   3. `getPlanillaPaymentUrlFromPagosimple(planillaId)`
 *      GET `/payroll/payment/{payroll_number}` → URL PSE. Se cachea en
 *      `planilla.pagosimplePaymentUrl` para no re-consultar.
 *
 * Endpoints usados (referencia Swagger PagoSimple):
 *   POST /payroll/upload        multipart, headers: nit+token+session+auth
 *   POST /payroll/validate      body: { payroll_code, execution_params }
 *   GET  /payroll/payment/{no}  devuelve URL PSE (string)
 *   GET  /payroll/inconsistencies/{no}?limit=&init_record=
 */

import { prisma } from '@pila/db';
import { pagosimpleRequest, pagosimpleMultipart } from './client';
import { getFullAuthHeaders } from './auth';
import { generarPlano } from '@/lib/planos/generar';
import type {
  PayrollInconsistenciesResponse,
  PayrollValidateResponse,
  PayrollValidationExecutionParams,
  PaymentUrlData,
} from './types';

// ============== Response de /payroll/upload ================================

/**
 * Respuesta observada del upload. PagoSimple puede devolver el número
 * directamente o anidado bajo `payroll_number` / `payroll_code`. Se
 * normaliza en `extractPayrollNumber`.
 */
type UploadResponse = { payroll_number?: string; payroll_code?: string; load_id?: string } | string;

function extractPayrollNumber(resp: UploadResponse): string | null {
  if (typeof resp === 'string') return resp || null;
  return resp?.payroll_number ?? resp?.payroll_code ?? null;
}

// ============== Helper: genera el contenido del plano ======================

/**
 * Replica el query de `app/api/planos/[id]/plano.txt/route.ts` y ejecuta
 * `generarPlano` para obtener el contenido + filename sin hacer un HTTP
 * loop sobre nuestra propia API.
 *
 * Nota: mantenemos este include duplicado acá; si aumenta el scope de
 * la query, mover a un helper compartido en `lib/planos`.
 */
async function obtenerContenidoPlano(
  planillaId: string,
): Promise<{ contenido: string; filename: string } | { error: string }> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    include: {
      periodo: true,
      empresa: {
        include: {
          departamentoRef: { select: { codigo: true } },
          municipioRef: { select: { codigo: true } },
          arl: { select: { codigo: true } },
        },
      },
      cotizante: {
        include: {
          departamento: { select: { codigo: true } },
          municipio: { select: { codigo: true } },
        },
      },
      createdBy: {
        include: { sucursal: { select: { codigo: true, nombre: true } } },
      },
      comprobantes: {
        include: {
          comprobante: {
            include: {
              cuentaCobro: {
                include: { sucursal: { select: { codigo: true, nombre: true } } },
              },
              liquidaciones: {
                include: {
                  liquidacion: {
                    include: {
                      afiliacion: {
                        include: {
                          cotizante: {
                            include: {
                              departamento: { select: { codigo: true } },
                              municipio: { select: { codigo: true } },
                            },
                          },
                          empresa: {
                            include: {
                              departamentoRef: { select: { codigo: true } },
                              municipioRef: { select: { codigo: true } },
                              arl: { select: { codigo: true } },
                            },
                          },
                          tipoCotizante: { select: { codigo: true } },
                          subtipo: { select: { codigo: true } },
                          planSgss: { select: { incluyeCcf: true } },
                          actividadEconomica: { select: { codigoCiiu: true } },
                          eps: { select: { codigo: true } },
                          afp: { select: { codigo: true } },
                          arl: { select: { codigo: true } },
                          ccf: { select: { codigo: true } },
                        },
                      },
                      conceptos: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!planilla) return { error: 'Planilla no encontrada.' };
  if (planilla.estado === 'ANULADA') {
    return { error: 'La planilla está anulada — no se puede enviar a PagoSimple.' };
  }

  // Cotizantes con mensualidad previa (para flag ING)
  const cotizanteIds = Array.from(
    new Set(
      planilla.comprobantes
        .flatMap((cp) => cp.comprobante.liquidaciones)
        .map((cl) => cl.liquidacion.afiliacion.cotizante.id),
    ),
  );
  const comprobanteIdsPlanilla = planilla.comprobantes.map((cp) => cp.comprobanteId);
  let cotizantesConMensualidadPrevia = new Set<string>();
  if (cotizanteIds.length > 0) {
    const liqsPrevias = await prisma.liquidacion.findMany({
      where: {
        tipo: 'MENSUALIDAD',
        afiliacion: { cotizanteId: { in: cotizanteIds } },
        comprobantes: {
          some: {
            comprobante: {
              estado: { not: 'ANULADO' },
              procesadoEn: { not: null },
              id: { notIn: comprobanteIdsPlanilla },
            },
          },
        },
      },
      select: { afiliacion: { select: { cotizanteId: true } } },
    });
    cotizantesConMensualidadPrevia = new Set(
      liqsPrevias.map((l) => l.afiliacion.cotizanteId).filter((x): x is string => x != null),
    );
  }

  const { contenido, filename } = generarPlano(planilla, cotizantesConMensualidadPrevia);
  return { contenido, filename };
}

// ============== 1) Upload ==================================================

export type UploadPlanillaResult =
  | { ok: true; payrollNumber: string }
  | { ok: false; error: string; code?: number };

export async function uploadPlanillaToPagosimple(
  planillaId: string,
): Promise<UploadPlanillaResult> {
  const archivo = await obtenerContenidoPlano(planillaId);
  if ('error' in archivo) return { ok: false, error: archivo.error };

  const headers = await getFullAuthHeaders();

  try {
    const resp = await pagosimpleMultipart<UploadResponse>(
      '/payroll/upload',
      'file',
      {
        buffer: Buffer.from(archivo.contenido, 'utf-8'),
        filename: archivo.filename,
      },
      {},
      { headers },
    );
    const payrollNumber = extractPayrollNumber(resp);
    if (!payrollNumber) {
      return {
        ok: false,
        error: 'PagoSimple respondió sin payroll_number — no se pudo vincular la planilla.',
      };
    }
    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        pagosimpleNumero: payrollNumber,
        pagosimpleSyncedAt: new Date(),
        pagosimpleEstadoValidacion: 'PENDIENTE',
      },
    });
    return { ok: true, payrollNumber };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error desconocido al subir el plano a PagoSimple',
      code: e.code,
    };
  }
}

// ============== 2) Validate ================================================

export type ValidatePlanillaResult =
  | { ok: true; validationStatus: string; response: PayrollValidateResponse }
  | { ok: false; error: string; code?: number };

export async function validatePlanillaInPagosimple(
  planillaId: string,
  opts?: Partial<PayrollValidationExecutionParams>,
): Promise<ValidatePlanillaResult> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { pagosimpleNumero: true, tipoPlanilla: true },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };
  if (!planilla.pagosimpleNumero) {
    return {
      ok: false,
      error: 'La planilla aún no ha sido enviada a PagoSimple. Hazlo primero con el botón "Subir".',
    };
  }

  const execution_params: PayrollValidationExecutionParams = {
    is_UGPP: opts?.is_UGPP ?? false,
    is_novelties_planillaN: opts?.is_novelties_planillaN ?? false,
    // `file_type` usa el código de tipo de planilla PILA (E, I, N, A, ...)
    // Por si el tipo local no coincide 1:1 con los permitidos, default a 'E'.
    file_type:
      opts?.file_type ??
      (['I', 'E', 'Y', 'N', 'A', 'K', 'S'].includes(planilla.tipoPlanilla)
        ? (planilla.tipoPlanilla as PayrollValidationExecutionParams['file_type'])
        : 'E'),
  };

  const headers = await getFullAuthHeaders();

  try {
    const resp = await pagosimpleRequest<PayrollValidateResponse>('/payroll/validate', {
      method: 'POST',
      headers,
      body: {
        payroll_code: planilla.pagosimpleNumero,
        execution_params,
      },
    });
    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        pagosimpleEstadoValidacion: resp.validation_status,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return { ok: true, validationStatus: resp.validation_status, response: resp };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error validando la planilla en PagoSimple',
      code: e.code,
    };
  }
}

// ============== 3) Payment URL =============================================

export type PaymentUrlResult =
  | { ok: true; url: string; cached: boolean }
  | { ok: false; error: string; code?: number };

export async function getPlanillaPaymentUrlFromPagosimple(
  planillaId: string,
  opts?: { force?: boolean },
): Promise<PaymentUrlResult> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { pagosimpleNumero: true, pagosimplePaymentUrl: true },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };
  if (!planilla.pagosimpleNumero) {
    return {
      ok: false,
      error:
        'La planilla aún no tiene payroll_number. Súbela y valídala antes de pedir URL de pago.',
    };
  }
  if (planilla.pagosimplePaymentUrl && !opts?.force) {
    return { ok: true, url: planilla.pagosimplePaymentUrl, cached: true };
  }

  const headers = await getFullAuthHeaders();

  try {
    const url = await pagosimpleRequest<PaymentUrlData>(
      `/payroll/payment/${encodeURIComponent(planilla.pagosimpleNumero)}`,
      { method: 'GET', headers },
    );
    if (!url || typeof url !== 'string') {
      return {
        ok: false,
        error: 'PagoSimple respondió sin URL de pago.',
      };
    }
    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        pagosimplePaymentUrl: url,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return { ok: true, url, cached: false };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error obteniendo URL de pago desde PagoSimple',
      code: e.code,
    };
  }
}

// ============== 4) Inconsistencies (opcional, diagnostico) =================

export type InconsistenciesResult =
  | { ok: true; data: PayrollInconsistenciesResponse }
  | { ok: false; error: string; code?: number };

export async function getPlanillaInconsistenciesFromPagosimple(
  planillaId: string,
  opts?: { limit?: number; init_record?: number },
): Promise<InconsistenciesResult> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { pagosimpleNumero: true },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };
  if (!planilla.pagosimpleNumero) {
    return { ok: false, error: 'La planilla no tiene payroll_number asociado.' };
  }

  const headers = await getFullAuthHeaders();
  const limit = opts?.limit ?? 50;
  const init = opts?.init_record ?? 0;
  const path = `/payroll/inconsistencies/${encodeURIComponent(planilla.pagosimpleNumero)}?limit=${limit}&init_record=${init}`;

  try {
    const data = await pagosimpleRequest<PayrollInconsistenciesResponse>(path, {
      method: 'GET',
      headers,
    });
    return { ok: true, data };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error consultando inconsistencias',
      code: e.code,
    };
  }
}
