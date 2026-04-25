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
import { getBaseAuthHeaders, getFullAuthHeaders } from './auth';
import { requirePagosimpleConfig } from './config';
import { generarPlano } from '@/lib/planos/generar';
import type {
  PayrollInconsistenciesResponse,
  PayrollTotalResponse,
  PayrollValidateResponse,
  PayrollValidationExecutionParams,
  PaymentUrlData,
} from './types';

// ============== Helper: extrae IDs del response =============================

/**
 * El validate retorna 2 identificadores que NO son lo mismo:
 *   - `payroll_code`: usado por GET /payroll/inconsistencies/{code}/...
 *   - `payroll_number`: usado por GET /payroll/total/{number}, payment/{number}
 *
 * Persistimos ambos. `pagosimpleNumero` (nuestro campo) guarda el number;
 * el code lo extraemos a la hora de pedir inconsistencias.
 */
function extractPayrollIds(resp: PayrollValidateResponse): {
  payrollNumber: string | null;
  payrollCode: string | null;
} {
  const first = resp.payroll_validations?.[0];
  // payroll_number=0 significa "no se guardó" (hay errores). Solo
  // tratamos como válido si es > 0.
  const rawNumber = first?.payroll_number;
  const payrollNumber = typeof rawNumber === 'number' && rawNumber > 0 ? String(rawNumber) : null;
  const payrollCode = first?.payroll_code ? String(first.payroll_code) : null;
  return { payrollNumber, payrollCode };
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
          arl: { select: { codigo: true, codigoMinSalud: true } },
        },
      },
      cotizante: {
        include: {
          departamento: { select: { codigo: true } },
          municipio: { select: { codigo: true } },
        },
      },
      sucursal: { select: { codigo: true, nombre: true } },
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
                              arl: { select: { codigo: true, codigoMinSalud: true } },
                            },
                          },
                          tipoCotizante: { select: { codigo: true } },
                          subtipo: { select: { codigo: true } },
                          planSgss: {
                            select: {
                              incluyeEps: true,
                              incluyeAfp: true,
                              incluyeArl: true,
                              incluyeCcf: true,
                            },
                          },
                          actividadEconomica: { select: { codigoCiiu: true } },
                          eps: { select: { codigo: true, codigoMinSalud: true } },
                          afp: { select: { codigo: true, codigoMinSalud: true } },
                          arl: { select: { codigo: true, codigoMinSalud: true } },
                          ccf: { select: { codigo: true, codigoMinSalud: true } },
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
    // SWAGGER (literal): "file_type, debe venir siempre en I." — el tipo
    // real (E/K/etc) lo lee el operador del encabezado del TXT.
    file_type: opts?.file_type ?? 'I',
  };

  // /payroll/validate exige auth_token del APORTANTE (la empresa o
  // cotizante de la planilla), no del master. Esa empresa típicamente
  // ya existe en PagoSimple como aportante operando — no requiere que
  // nosotros la creamos vía PS-B, solo pedimos su auth_token.
  const cfg = requirePagosimpleConfig();

  // Multipart manual con fetch directo (archivo + string en mismo
  // FormData). PagoSimple valida el MIME type: debe ser text/plain.
  const url = `${cfg.baseUrl}/payroll/validate`;
  const fd = new FormData();
  fd.append(
    'payroll_file',
    new Blob([new Uint8Array(Buffer.from(archivo.contenido, 'utf-8'))], {
      type: 'text/plain',
    }),
    archivo.filename,
  );
  fd.append('execution_params', JSON.stringify(execution_params));

  // Auth: PagoSimple exige el `id` INTERNO del aportante (Integer
  // asignado por el operador, no el NIT). Lo configuramos manualmente
  // en el form de Empresa al campo `pagosimpleContributorId`.
  let auth: { id: string; documentType: string; document: string };
  if (planilla.empresa) {
    if (!planilla.empresa.pagosimpleContributorId) {
      return {
        ok: false,
        error: `Falta el ID interno PagoSimple de la empresa "${planilla.empresa.nombre}". Cárgalo en /admin/empresas/${planilla.empresa.id} (campo "ID PagoSimple") — lo encuentras en la URL del aportante en el panel del operador.`,
      };
    }
    auth = {
      id: planilla.empresa.pagosimpleContributorId,
      documentType: 'NI',
      document: planilla.empresa.nit,
    };
  } else if (planilla.cotizante) {
    if (!planilla.cotizante.pagosimpleContributorId) {
      return {
        ok: false,
        error: `Falta el ID interno PagoSimple del cotizante. Cárgalo en su perfil — lo encuentras en el panel del operador.`,
      };
    }
    auth = {
      id: planilla.cotizante.pagosimpleContributorId,
      documentType: planilla.cotizante.tipoDocumento,
      document: planilla.cotizante.numeroDocumento,
    };
  } else {
    return {
      ok: false,
      error: 'Planilla sin aportante (empresa ni cotizante).',
    };
  }

  let headers: Awaited<ReturnType<typeof getFullAuthHeaders>>;
  try {
    headers = await getFullAuthHeaders(auth);
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    if (/aportante no existe/i.test(msg)) {
      return {
        ok: false,
        error: `El ID interno (${auth.id}) no existe en PagoSimple. Verifica el valor capturado en el form de la empresa contra el del panel del operador.`,
      };
    }
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

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
      // eslint-disable-next-line no-console
      console.error(
        `[pagosimple] POST /payroll/validate — code=${json.code} msg="${json.message}" desc="${json.description}"`,
      );
      return {
        ok: false,
        error: json.message ?? `PagoSimple respondió code=${json.code}`,
        code: json.code,
      };
    }
    let data = json.data;
    let { payrollNumber, payrollCode } = extractPayrollIds(data);

    // ── Auto-corrección ────────────────────────────────────────────
    // Si TODOS los errores devueltos son `autocorrect: "Si"`, llamamos
    // POST /payroll/correction para que PagoSimple los repare y
    // re-procese el plano. Si después de corregir queda sin errores,
    // la planilla queda guardada oficialmente (payroll_number > 0).
    //
    // Si hay aunque sea UN error con autocorrect="No", no intentamos
    // corregir — la planilla va directo a Validación para que el
    // usuario corrija a mano los datos de origen y vuelva a generar.
    {
      const first1 = data.payroll_validations?.[0];
      const errs1 = [
        ...(first1?.detail_errors_company ?? []),
        ...(first1?.detail_errors_contributor ?? []),
      ];
      const todosAutocorregibles = errs1.length > 0 && errs1.every((e) => e.autocorrect === 'Si');

      if (todosAutocorregibles && payrollCode) {
        // eslint-disable-next-line no-console
        console.log(
          `[pagosimple] auto-corrección disparada (${errs1.length} errores autocorregibles)`,
        );
        try {
          const correctionResp = await fetch(`${cfg.baseUrl}/payroll/correction`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payroll_code: payrollCode,
              is_UGPP: execution_params.is_UGPP,
              is_novelties_planillaN: execution_params.is_novelties_planillaN,
            }),
          });
          const corrRaw = await correctionResp.text();
          const corrJson = JSON.parse(corrRaw) as typeof json;
          if (corrJson?.success && corrJson.data) {
            // Reemplazamos la data con la corregida; el operador asigna
            // un payroll_number nuevo si la corrección sirvió.
            data = corrJson.data;
            const ids = extractPayrollIds(data);
            payrollNumber = ids.payrollNumber;
            payrollCode = ids.payrollCode;
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              `[pagosimple] /payroll/correction respondió success=false: ${corrJson?.message}`,
            );
          }
        } catch (corrErr) {
          // eslint-disable-next-line no-console
          console.error(
            `[pagosimple] /payroll/correction falló: ${corrErr instanceof Error ? corrErr.message : corrErr}`,
          );
        }
      }
    }

    const first = data.payroll_validations?.[0];
    const numErrors = (first?.number_errors_company ?? 0) + (first?.number_errors_contributor ?? 0);
    const planillaGuardadaOk = payrollNumber !== null && numErrors === 0;

    if (!payrollCode && !payrollNumber) {
      // eslint-disable-next-line no-console
      console.error(
        `[pagosimple] POST /payroll/validate — sin code ni number. data: ${JSON.stringify(data).slice(0, 300)}`,
      );
      return {
        ok: false,
        error: 'PagoSimple no devolvió payroll_code ni number — verifica el plano.',
      };
    }

    // Estado interno: mapeamos según el resultado real, no según
    // `validation_status` (que solo dice "validación ejecutada").
    //   - OK     = guardada oficialmente (payroll_number > 0 y 0 errores)
    //   - ERROR  = tiene errores no auto-corregibles → tab Validación
    const estadoInterno = planillaGuardadaOk ? 'OK' : 'ERROR';

    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        // Si payroll_number=0 (no se guardó), guardamos el code para
        // poder consultar inconsistencias después. Si number>0, ese es
        // el número oficial y lo usamos para todo.
        pagosimpleNumero: payrollNumber ?? payrollCode,
        pagosimpleEstadoValidacion: estadoInterno,
        pagosimpleSyncedAt: new Date(),
      },
    });
    // eslint-disable-next-line no-console
    console.log(
      `[pagosimple] POST /payroll/validate — code=${payrollCode} number=${payrollNumber ?? '0 (no guardada)'} errors=${numErrors} → ${estadoInterno}`,
    );

    // Best-effort: si la validación pasó, traer también los totales
    // (sin mora / mora / a pagar) para mostrar en la tabla. Si falla,
    // no rompe el resultado del validate.
    if (data.validation_status === 'OK') {
      try {
        await getPlanillaTotalsFromPagosimple(planillaId);
      } catch (totErr) {
        // eslint-disable-next-line no-console
        console.warn(
          `[pagosimple] No se pudieron traer totales tras validate: ${
            totErr instanceof Error ? totErr.message : totErr
          }`,
        );
      }
    }

    return {
      ok: true,
      payrollNumber: payrollNumber ?? payrollCode ?? '0',
      validationStatus: estadoInterno,
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

// ============== 2½) Totales (con mora) =====================================

export type PlanillaTotalsResult =
  | {
      ok: true;
      totalSgss: number;
      totalMora: number;
      totalPagar: number;
      response: PayrollTotalResponse;
    }
  | { ok: false; error: string; code?: number };

/**
 * GET /payroll/total/{payroll_number}: devuelve los totales por
 * subsistema con `total_without_arrear`, `arrear_value` y el `total`
 * por administradora. Sumamos los 3 globales y los persistimos en la
 * Planilla para mostrar en la tabla Guardado.
 */
export async function getPlanillaTotalsFromPagosimple(
  planillaId: string,
): Promise<PlanillaTotalsResult> {
  const planilla = await prisma.planilla.findUnique({
    where: { id: planillaId },
    select: {
      pagosimpleNumero: true,
      empresa: { select: { nit: true, pagosimpleContributorId: true } },
      cotizante: {
        select: {
          numeroDocumento: true,
          tipoDocumento: true,
          pagosimpleContributorId: true,
        },
      },
    },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };
  if (!planilla.pagosimpleNumero) {
    return { ok: false, error: 'La planilla no tiene payroll_number.' };
  }

  // Mismos headers full que validate — auth_token del aportante real.
  let auth: { id: string; documentType: string; document: string };
  if (planilla.empresa?.pagosimpleContributorId) {
    auth = {
      id: planilla.empresa.pagosimpleContributorId,
      documentType: 'NI',
      document: planilla.empresa.nit,
    };
  } else if (planilla.cotizante?.pagosimpleContributorId) {
    auth = {
      id: planilla.cotizante.pagosimpleContributorId,
      documentType: planilla.cotizante.tipoDocumento,
      document: planilla.cotizante.numeroDocumento,
    };
  } else {
    return { ok: false, error: 'Falta el ID interno PagoSimple del aportante.' };
  }

  let headers: Awaited<ReturnType<typeof getFullAuthHeaders>>;
  try {
    headers = await getFullAuthHeaders(auth);
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

  try {
    const data = await pagosimpleRequest<PayrollTotalResponse>(
      `/payroll/total/${encodeURIComponent(planilla.pagosimpleNumero)}`,
      { method: 'GET', headers },
    );
    const totalSgss = data.administrator_total_value.reduce(
      (s, a) => s + (Number(a.total_without_arrear) || 0),
      0,
    );
    const totalMora = data.administrator_total_value.reduce(
      (s, a) => s + (Number(a.arrear_value) || 0),
      0,
    );
    const totalPagar = Number(data.total_to_pay) || totalSgss + totalMora;

    await prisma.planilla.update({
      where: { id: planillaId },
      data: {
        pagosimpleTotalSgss: totalSgss,
        pagosimpleTotalMora: totalMora,
        pagosimpleTotalPagar: totalPagar,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return { ok: true, totalSgss, totalMora, totalPagar, response: data };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error obteniendo totales',
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
    select: {
      pagosimpleNumero: true,
      pagosimplePaymentUrl: true,
      empresa: { select: { nit: true, pagosimpleContributorId: true } },
      cotizante: {
        select: {
          numeroDocumento: true,
          tipoDocumento: true,
          pagosimpleContributorId: true,
        },
      },
    },
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

  // Auth full con el id interno del aportante (igual que validate).
  let auth: { id: string; documentType: string; document: string };
  if (planilla.empresa?.pagosimpleContributorId) {
    auth = {
      id: planilla.empresa.pagosimpleContributorId,
      documentType: 'NI',
      document: planilla.empresa.nit,
    };
  } else if (planilla.cotizante?.pagosimpleContributorId) {
    auth = {
      id: planilla.cotizante.pagosimpleContributorId,
      documentType: planilla.cotizante.tipoDocumento,
      document: planilla.cotizante.numeroDocumento,
    };
  } else {
    return { ok: false, error: 'Falta el ID interno PagoSimple del aportante.' };
  }

  let headers: Awaited<ReturnType<typeof getFullAuthHeaders>>;
  try {
    headers = await getFullAuthHeaders(auth);
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

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
    select: {
      pagosimpleNumero: true,
      empresa: { select: { nit: true, pagosimpleContributorId: true } },
      cotizante: {
        select: {
          numeroDocumento: true,
          tipoDocumento: true,
          pagosimpleContributorId: true,
        },
      },
    },
  });
  if (!planilla) return { ok: false, error: 'Planilla no encontrada.' };
  if (!planilla.pagosimpleNumero) {
    return { ok: false, error: 'La planilla no tiene payroll_number asociado.' };
  }

  // Auth full con el id interno del aportante.
  let auth: { id: string; documentType: string; document: string };
  if (planilla.empresa?.pagosimpleContributorId) {
    auth = {
      id: planilla.empresa.pagosimpleContributorId,
      documentType: 'NI',
      document: planilla.empresa.nit,
    };
  } else if (planilla.cotizante?.pagosimpleContributorId) {
    auth = {
      id: planilla.cotizante.pagosimpleContributorId,
      documentType: planilla.cotizante.tipoDocumento,
      document: planilla.cotizante.numeroDocumento,
    };
  } else {
    return { ok: false, error: 'Falta el ID interno PagoSimple del aportante.' };
  }

  let headers: Awaited<ReturnType<typeof getFullAuthHeaders>>;
  try {
    headers = await getFullAuthHeaders(auth);
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

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
