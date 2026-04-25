/**
 * Integración PagoSimple — flujo de planillas (Swagger oficial).
 *
 * Solo DOS pasos (no tres como pensábamos al inicio):
 *
 *   1. `validatePlanillaInPagosimple(planillaId, opts)`
 *      POST /payroll/validate (multipart): sube el archivo plano
 *      generado localmente + execution_params como JSON string.
 *      Devuelve validation_status (OK/WARNING/ERROR) y el payroll_code
 *      que se persiste en `planilla.pagosimpleNumero`. Una sola llamada
 *      que cubre lo que originalmente pensábamos como upload+validate.
 *
 *   2. `getPlanillaPaymentUrlFromPagosimple(planillaId)`
 *      GET /payroll/payment/{payroll_number} → URL PSE. Se cachea en
 *      `planilla.pagosimplePaymentUrl` para no re-consultar.
 *
 * Endpoints (referencia Swagger):
 *   POST /payroll/validate                     multipart, headers: nit+token+session+auth
 *     fields: payroll_file (binary), execution_params (JSON string)
 *   GET  /payroll/payment/{payroll_number}     URL PSE
 *   GET  /payroll/inconsistencies/{code}/{init_record}
 *   GET  /payroll/total/{payroll_number}
 *   POST /payroll/correction
 */

import { prisma } from '@pila/db';
import { pagosimpleRequest } from './client';
import { getFullAuthHeaders } from './auth';
import { requirePagosimpleConfig } from './config';
import { generarPlano } from '@/lib/planos/generar';
import type {
  PayrollInconsistenciesResponse,
  PayrollValidateResponse,
  PayrollValidationExecutionParams,
  PaymentUrlData,
} from './types';

// ============== Helper: extrae payroll_number del response =================

function extractPayrollNumber(
  resp: PayrollValidateResponse & { payroll_code?: string; payroll_number?: string },
): string | null {
  // El validate devuelve principalmente payroll_validations[]; el código
  // puede venir en payroll_code o dentro del array como payroll_code.
  if (resp.payroll_code) return resp.payroll_code;
  if (resp.payroll_number) return resp.payroll_number;
  const first = resp.payroll_validations?.[0];
  if (first?.payroll_code) return String(first.payroll_code);
  if (first?.payroll_number) return String(first.payroll_number);
  return null;
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

// ============== 1) Validate (sube + valida en una sola llamada) ============

export type ValidatePlanillaResult =
  | {
      ok: true;
      validationStatus: string;
      payrollNumber: string;
      response: PayrollValidateResponse;
    }
  | { ok: false; error: string; code?: number };

/**
 * POST /payroll/validate (multipart):
 *   - field `payroll_file`: binary del plano
 *   - field `execution_params`: JSON string con {is_UGPP, is_novelties_planillaN, file_type}
 *
 * Response devuelve `validation_status` + `payroll_validations[]` con
 * el `payroll_code`/`payroll_number` que persistimos para usar en pago.
 */
export async function validatePlanillaInPagosimple(
  planillaId: string,
  opts?: Partial<PayrollValidationExecutionParams>,
): Promise<ValidatePlanillaResult> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: { tipoPlanilla: true, empresa: true, cotizante: true },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };

  const archivo = await obtenerContenidoPlano(planillaId);
  if ('error' in archivo) return { ok: false, error: archivo.error };

  const execution_params: PayrollValidationExecutionParams = {
    is_UGPP: opts?.is_UGPP ?? false,
    is_novelties_planillaN: opts?.is_novelties_planillaN ?? false,
    // `file_type` usa el código de tipo de planilla PILA (E, I, N, A, ...)
    file_type:
      opts?.file_type ??
      (['I', 'E', 'Y', 'N', 'A', 'K', 'S'].includes(planilla.tipoPlanilla)
        ? (planilla.tipoPlanilla as PayrollValidationExecutionParams['file_type'])
        : 'E'),
  };

  // Para validar, PagoSimple exige auth_token del aportante (el que paga)
  // — no del usuario master. Se obtiene contra el contributor que ya
  // existe en PagoSimple (sync de Empresa o Cotizante-Indep).
  const cfg = requirePagosimpleConfig();
  let auth: { id: string; documentType: string; document: string };
  if (planilla.empresa) {
    auth = { id: planilla.empresa.nit, documentType: 'NI', document: planilla.empresa.nit };
  } else if (planilla.cotizante) {
    auth = {
      id: planilla.cotizante.numeroDocumento,
      documentType: planilla.cotizante.tipoDocumento,
      document: planilla.cotizante.numeroDocumento,
    };
  } else {
    auth = {
      id: cfg.masterNit,
      documentType: cfg.masterDocumentType,
      document: cfg.masterDocument,
    };
  }
  const headers = await getFullAuthHeaders(auth);

  // Multipart manual — pagosimpleMultipart no soporta múltiples campos
  // de string + file; usamos fetch directo con FormData.
  const url = `${cfg.baseUrl}/payroll/validate`;
  const fd = new FormData();
  fd.append(
    'payroll_file',
    new Blob([new Uint8Array(Buffer.from(archivo.contenido, 'utf-8'))]),
    archivo.filename,
  );
  fd.append('execution_params', JSON.stringify(execution_params));

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers, // sin Content-Type — fetch lo asigna con boundary
      body: fd,
    });
    const raw = await resp.text();
    let json: {
      success?: boolean;
      code?: number;
      message?: string;
      description?: string;
      data?: PayrollValidateResponse;
    } | null = null;
    try {
      json = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: `Respuesta no-JSON HTTP ${resp.status}: ${raw.slice(0, 200)}`,
        code: resp.status,
      };
    }
    if (typeof json?.success !== 'boolean') {
      return {
        ok: false,
        error: `HTTP ${resp.status} formato inesperado: ${JSON.stringify(json).slice(0, 200)}`,
        code: resp.status,
      };
    }
    if (!json.success || !json.data) {
      return {
        ok: false,
        error: json.message ?? `PagoSimple respondió code=${json.code}`,
        code: json.code,
      };
    }
    const data = json.data;
    const payrollNumber = extractPayrollNumber(data);
    if (!payrollNumber) {
      return {
        ok: false,
        error: 'PagoSimple validó pero no devolvió payroll_number — verifica el plano.',
      };
    }
    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        pagosimpleNumero: payrollNumber,
        pagosimpleEstadoValidacion: data.validation_status,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return {
      ok: true,
      payrollNumber,
      validationStatus: data.validation_status,
      response: data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de red';
    return {
      ok: false,
      error: `Error validando planilla en PagoSimple: ${msg}`,
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
  // Swagger: GET /payroll/inconsistencies/{payroll_code}/{init_record}
  const init = opts?.init_record ?? 0;
  const path = `/payroll/inconsistencies/${encodeURIComponent(planilla.pagosimpleNumero)}/${init}`;

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
