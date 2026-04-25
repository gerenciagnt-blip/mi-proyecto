/**
 * Integración PagoSimple — comprobantes oficiales (API Vouchers).
 *
 * Tras pagar una planilla en PSE, el operador genera el comprobante
 * oficial como PDF. Este módulo pide ese PDF por número de documento +
 * periodo para mostrarlo al usuario desde el historial de transacciones.
 *
 * Endpoint (Swagger oficial):
 *   POST /vouchers/report-types  (vouchers en plural)
 *     headers: nit + token  (NO session_token ni auth_token)
 *     body: { document_type, document, quote_period, report_type, payroll_number? }
 *     data: string (PDF en base64, sin el prefijo `data:`)
 *
 * `report_type`:
 *   '1' = prefactura (antes de pagar)
 *   '2' = comprobante pagado
 *
 * Por defecto usamos '2'; el campo queda parametrizable por si en el
 * futuro queremos descargar prefacturas desde otro lado (ej. cuando
 * la planilla está en estado Guardada pero aún no pagada).
 */

import { prisma } from '@pila/db';
import { pagosimpleRequest } from './client';
import { getSessionTokens } from './auth';
import { requirePagosimpleConfig } from './config';
import type { VoucherPdfBase64, VoucherReportTypesRequest } from './types';

export type VoucherFetchResult =
  | {
      ok: true;
      /** PDF ya decodificado como Buffer, listo para stream. */
      pdf: Buffer;
      /** Nombre sugerido para el archivo descargado. */
      filename: string;
    }
  | { ok: false; error: string; code?: number };

/**
 * Descarga el comprobante oficial (PDF) de PagoSimple para el
 * comprobante interno dado. Maneja:
 *
 *   - Validaciones locales (agrupación INDIVIDUAL, cotizante presente,
 *     planilla con `pagosimpleNumero`).
 *   - Llamada a /voucher/report-types con `report_type='2'` por default.
 *   - Decodificación base64 → Buffer.
 *   - Elección de filename según consecutivo + periodo.
 */
export async function fetchComprobantePagoSimple(
  comprobanteId: string,
  opts?: { reportType?: '1' | '2' },
): Promise<VoucherFetchResult> {
  const comp = await prisma.comprobante.findUnique({
    where: { id: comprobanteId },
    select: {
      id: true,
      consecutivo: true,
      agrupacion: true,
      estado: true,
      cotizante: {
        select: {
          tipoDocumento: true,
          numeroDocumento: true,
        },
      },
      periodo: { select: { anio: true, mes: true } },
      planillas: {
        where: {
          planilla: {
            estado: { not: 'ANULADA' },
            pagosimpleNumero: { not: null },
          },
        },
        select: {
          planilla: {
            select: {
              pagosimpleNumero: true,
              estado: true,
            },
          },
        },
      },
    },
  });

  if (!comp) return { ok: false, error: 'Comprobante no encontrado.' };
  if (comp.estado === 'ANULADO') {
    return {
      ok: false,
      error: 'Este comprobante está anulado — PagoSimple no tiene PDF.',
    };
  }
  if (comp.agrupacion !== 'INDIVIDUAL') {
    return {
      ok: false,
      error:
        'El comprobante oficial PagoSimple solo aplica a comprobantes individuales (1 cotizante).',
    };
  }
  if (!comp.cotizante) {
    return {
      ok: false,
      error: 'Falta el cotizante asociado al comprobante.',
    };
  }
  const planilla = comp.planillas[0]?.planilla;
  if (!planilla?.pagosimpleNumero) {
    return {
      ok: false,
      error: 'La planilla aún no se ha subido a PagoSimple. Hazlo desde /admin/planos primero.',
    };
  }

  const quotePeriod = `${comp.periodo.anio}${String(comp.periodo.mes).padStart(2, '0')}`;
  const reportType: '1' | '2' = opts?.reportType ?? '2';

  const body: VoucherReportTypesRequest = {
    document_type: comp.cotizante.tipoDocumento,
    document: comp.cotizante.numeroDocumento,
    quote_period: quotePeriod,
    payroll_number: planilla.pagosimpleNumero,
    report_type: reportType,
  };

  const { token } = await getSessionTokens();
  const cfg = requirePagosimpleConfig();
  const headers = { nit: cfg.masterNit, token };

  try {
    const base64 = await pagosimpleRequest<VoucherPdfBase64>('/vouchers/report-types', {
      method: 'POST',
      headers,
      body,
    });
    if (!base64 || typeof base64 !== 'string') {
      return {
        ok: false,
        error: 'PagoSimple respondió sin PDF.',
      };
    }
    const clean = base64.replace(/^data:application\/pdf;base64,/, '').trim();
    const pdf = Buffer.from(clean, 'base64');
    if (pdf.length === 0) {
      return { ok: false, error: 'El PDF devuelto está vacío.' };
    }
    const kind = reportType === '1' ? 'prefactura' : 'comprobante';
    const filename = `${kind}-${comp.consecutivo}-${quotePeriod}.pdf`;
    return { ok: true, pdf, filename };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error descargando el comprobante desde PagoSimple',
      code: e.code,
    };
  }
}
