/**
 * Sync de aportantes contra PagoSimple.
 *
 * Flujo:
 *   - Nuestro modelo (Empresa / Cotizante) → se mapea a
 *     ContributorCorporateRequest / ContributorIndependentRequest.
 *   - Llamada a PagoSimple (POST al endpoint correspondiente).
 *   - La respuesta `data.id` (el contributor_id generado por PagoSimple)
 *     se persiste en `pagosimpleContributorId` para referencia futura.
 *
 * Endpoints (API 2 · Aportantes):
 *   POST /contributor/corporate      → crear aportante empresa
 *   PUT  /contributor/corporate/{id} → actualizar
 *   POST /contributor/independent    → crear aportante independiente
 *   PUT  /contributor/independent/{id} → actualizar
 *
 * Campos con defaults documentados — algunos códigos PILA (classification,
 * presentation_format, legal_nature, etc.) NO los guardamos localmente y
 * usamos valores razonables. Si PagoSimple los rechaza, ajustar acá.
 *
 * Idempotencia: si ya tiene `pagosimpleContributorId`, hacemos PUT
 * (actualización). Si no, POST (creación). El ID devuelto por el POST
 * queda guardado para la próxima.
 */

import { prisma } from '@pila/db';
import type { TipoDocumento } from '@pila/db';
import { pagosimpleRequest } from './client';
import { getBaseAuthHeaders, getFullAuthHeaders } from './auth';
import type {
  ContactInformation,
  ContributorIndependentRequest,
  ContributorCorporateRequest,
  ExtraValidation,
} from './types';

// ============== Defaults PILA =============================================

/**
 * Defaults para campos que PagoSimple exige pero no guardamos localmente.
 * Documentados para poder ajustar si la API los rechaza.
 */
const DEFAULTS = {
  /** 1 = formato de presentación ÚNICO (la empresa maneja una sola sede). */
  presentation_format_id: 1,
  /** 50 = persona jurídica por default (para corporate). */
  legal_nature_id_juridica: 50,
  /** 1 = persona natural (para independent). */
  legal_nature_id_natural: 1,
  /** 2 = clasificación "Empleador permanente" (corporate default). */
  classification_contributor_id_corporate: 2,
  classification_contributor_code_corporate: '2',
  /** 1 = clasificación "Independiente" (independent default). */
  classification_contributor_id_independent: 1,
  classification_contributor_code_independent: '1',
  /** 1 = acción "alta". */
  type_action_id: 1,
  /** 1 = tipo contribuyente "Empleador/Aportante". */
  type_contributor_id: 1,
  /** "1" = tipo pagador pensión (afiliado obligatorio). */
  type_payer_pension_id: '1',
  /** 1 = Natural, 2 = Jurídica. */
  type_person_id_natural: 1,
  type_person_id_juridica: 2,
} as const;

const EXTRA_VALIDATION_DEFAULT: ExtraValidation = {
  sheet_duplication: 'N',
  values_voucher: 'N',
  new_income_withdrawal: 'N',
  exonerated_parafiscal_payment: 'N',
  family_compensation_fund_benefit: 'N',
  replaces_contributing_health_administrator: 'N',
  replaces_contributor_upc_value: 'N',
  replaces_contributing_names: 'N',
};

// ============== Helpers ====================================================

/**
 * Calcula el DV (dígito de verificación) de un NIT colombiano.
 * Algoritmo estándar DIAN: suma ponderada + mod 11.
 */
export function calcularDv(nit: string): number {
  const digits = nit.replace(/\D/g, '');
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < digits.length; i++) {
    const peso = pesos[digits.length - 1 - i] ?? 0;
    const d = Number(digits[i]) || 0;
    suma += d * peso;
  }
  const resto = suma % 11;
  if (resto === 0 || resto === 1) return resto;
  return 11 - resto;
}

/**
 * Mapea el enum local TipoDocumento → código PagoSimple.
 * Los códigos son los estándar PILA (CC, CE, TI, RC, PAS).
 * Para NIP usamos 'NIP'; ajustar si PagoSimple usa otro.
 */
function mapTipoDocumento(tipo: TipoDocumento): string {
  // Afortunadamente los códigos coinciden entre nuestra BD y PILA.
  return tipo;
}

// ============== Sync · Empresa (corporate) ================================

export type SyncEmpresaResult =
  | { ok: true; contributorId: string; mode: 'created' | 'updated' }
  | { ok: false; error: string; code?: number };

/**
 * Sincroniza una Empresa con PagoSimple como aportante corporativo.
 * Idempotente: si ya existe `pagosimpleContributorId`, actualiza; si no,
 * crea y guarda el ID retornado.
 */
export async function syncEmpresaAsContributor(empresaId: string): Promise<SyncEmpresaResult> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: {
      arl: true,
      departamentoRef: true,
      municipioRef: true,
    },
  });
  if (!empresa) return { ok: false, error: 'Empresa no encontrada.' };

  // Validaciones locales básicas — PagoSimple va a rechazar igual, pero
  // mejor dar mensajes claros antes de llamar.
  const missing: string[] = [];
  if (!empresa.ciiuPrincipal) missing.push('CIIU principal');
  if (!empresa.arl?.codigo) missing.push('ARL');
  if (!empresa.departamentoRef?.codigo) missing.push('departamento DIVIPOLA');
  if (!empresa.municipioRef?.codigo) missing.push('municipio DIVIPOLA');
  if (!empresa.direccion) missing.push('dirección');
  if (!empresa.email) missing.push('email');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Faltan datos obligatorios en la empresa: ${missing.join(', ')}.`,
    };
  }

  const dv = empresa.dv ? Number(empresa.dv) : calcularDv(empresa.nit);

  const companyContact: ContactInformation = {
    type_identification: 'NI',
    identification_number: empresa.nit,
    first_name: empresa.nombre,
    surname: empresa.nombre, // para personas jurídicas PagoSimple usa business_name aparte, pero first_name/surname son obligatorios
    email: empresa.email!,
    phone_number: empresa.telefono ?? null,
    cell_phone_number: empresa.telefono ?? null,
    department_code: empresa.departamentoRef!.codigo,
    municipal_code: empresa.municipioRef!.codigo,
    address_data: {
      full_address: empresa.direccion!,
    },
  };

  // Representante legal — si falta, reutilizamos el contacto de la empresa
  // (mejor eso que romper la request).
  const legalRep: ContactInformation = empresa.repLegalNombre
    ? {
        type_identification: empresa.repLegalTipoDoc ?? 'CC',
        identification_number: empresa.repLegalNumeroDoc ?? '',
        first_name: empresa.repLegalNombre.split(/\s+/)[0] ?? empresa.repLegalNombre,
        surname: empresa.repLegalNombre.split(/\s+/).slice(1).join(' ') || empresa.repLegalNombre,
        email: empresa.email!,
        department_code: empresa.departamentoRef!.codigo,
        municipal_code: empresa.municipioRef!.codigo,
        address_data: { full_address: empresa.direccion! },
      }
    : companyContact;

  const body: ContributorCorporateRequest = {
    id: empresa.pagosimpleContributorId ?? null,
    economic_activity_code: empresa.ciiuPrincipal!,
    classification_contributor_code: DEFAULTS.classification_contributor_code_corporate,
    classification_contributor_id: DEFAULTS.classification_contributor_id_corporate,
    occupational_risk_administrator_code: empresa.arl!.codigo,
    digit_verification: dv,
    status: empresa.active ? 'ACTIVE' : 'INACTIVE',
    presentation_format_id: DEFAULTS.presentation_format_id,
    legal_nature_id: DEFAULTS.legal_nature_id_juridica,
    identification_number: empresa.nit,
    pay_esap_min: false,
    business_name: empresa.nombre,
    type_action_id: DEFAULTS.type_action_id,
    type_contributor_id: DEFAULTS.type_contributor_id,
    type_identification: 'NI',
    type_payer_pension_id: DEFAULTS.type_payer_pension_id,
    type_person_id: DEFAULTS.type_person_id_juridica,
    information_contact: companyContact,
    business_contact_information: companyContact,
    legal_representative: legalRep,
    branches: [], // por ahora sin sucursales — se pueden agregar luego
    extra_validation: EXTRA_VALIDATION_DEFAULT,
  };

  // Swagger PagoSimple — corporate:
  //   POST /contributor/corporate    (crear)  → headers: nit+token+session
  //   PUT  /contributor/corporate    (actualizar) → +auth_token, id va en body
  const isUpdate = Boolean(empresa.pagosimpleContributorId);
  const path = '/contributor/corporate';
  const headers = isUpdate
    ? await getFullAuthHeaders({
        id: empresa.nit,
        documentType: 'NI',
        document: empresa.nit,
      })
    : await getBaseAuthHeaders();

  try {
    const data = await pagosimpleRequest<{ id?: string } | string>(path, {
      method: isUpdate ? 'PUT' : 'POST',
      headers,
      body,
    });
    const contributorId =
      typeof data === 'string' ? data : (data?.id ?? empresa.pagosimpleContributorId ?? '');
    if (!contributorId) {
      return {
        ok: false,
        error: 'PagoSimple respondió sin contributor_id — no se pudo guardar el vínculo.',
      };
    }
    await prisma.empresa.update({
      where: { id: empresa.id },
      data: {
        pagosimpleContributorId: contributorId,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return { ok: true, contributorId, mode: isUpdate ? 'updated' : 'created' };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error desconocido al sincronizar con PagoSimple',
      code: e.code,
    };
  }
}

// ============== Sync · Cotizante Independiente ============================

export type SyncCotizanteResult =
  | { ok: true; contributorId: string; mode: 'created' | 'updated' }
  | { ok: false; error: string; code?: number };

/**
 * Sincroniza un Cotizante INDEPENDIENTE con PagoSimple.
 * Requiere que el cotizante tenga al menos una afiliación INDEPENDIENTE
 * (de ella tomamos actividad económica, ARL y nivel de riesgo).
 */
export async function syncCotizanteIndependienteAsContributor(
  cotizanteId: string,
): Promise<SyncCotizanteResult> {
  const cot = await prisma.cotizante.findUnique({
    where: { id: cotizanteId },
    include: {
      departamento: true,
      municipio: true,
      afiliaciones: {
        where: { modalidad: 'INDEPENDIENTE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { arl: true, actividadEconomica: true },
      },
    },
  });
  if (!cot) return { ok: false, error: 'Cotizante no encontrado.' };
  const afi = cot.afiliaciones[0];
  if (!afi) {
    return {
      ok: false,
      error:
        'El cotizante no tiene afiliación INDEPENDIENTE; no se puede crear como aportante en PagoSimple.',
    };
  }

  const missing: string[] = [];
  if (!cot.departamento?.codigo) missing.push('departamento DIVIPOLA');
  if (!cot.municipio?.codigo) missing.push('municipio DIVIPOLA');
  if (!cot.direccion) missing.push('dirección');
  if (!cot.email) missing.push('email');
  if (!afi.actividadEconomica?.codigoCiiu) missing.push('actividad económica CIIU');
  if (!afi.arl?.codigo) missing.push('ARL');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Faltan datos obligatorios en el cotizante: ${missing.join(', ')}.`,
    };
  }

  const fullName = [cot.primerNombre, cot.segundoNombre, cot.primerApellido, cot.segundoApellido]
    .filter(Boolean)
    .join(' ');

  const contact: ContactInformation = {
    type_identification: mapTipoDocumento(cot.tipoDocumento),
    identification_number: cot.numeroDocumento,
    first_name: cot.primerNombre,
    second_name: cot.segundoNombre ?? null,
    surname: cot.primerApellido,
    second_surname: cot.segundoApellido ?? null,
    email: cot.email!,
    phone_number: cot.telefono ?? null,
    cell_phone_number: cot.celular ?? null,
    department_code: cot.departamento!.codigo,
    municipal_code: cot.municipio!.codigo,
    address_data: { full_address: cot.direccion! },
    full_name: fullName,
  };

  const body: ContributorIndependentRequest = {
    id: cot.pagosimpleContributorId ?? null,
    economic_activity_code: afi.actividadEconomica!.codigoCiiu,
    classification_contributor_code: DEFAULTS.classification_contributor_code_independent,
    classification_contributor_id: DEFAULTS.classification_contributor_id_independent,
    occupational_risk_administrator_code: afi.arl!.codigo,
    digit_verification: 0, // no aplica para personas naturales
    status: 'ACTIVE',
    presentation_format_id: DEFAULTS.presentation_format_id,
    legal_nature_id: DEFAULTS.legal_nature_id_natural,
    identification_number: cot.numeroDocumento,
    pay_esap_min: false,
    business_name: fullName,
    type_action_id: DEFAULTS.type_action_id,
    type_contributor_id: DEFAULTS.type_contributor_id,
    type_identification: mapTipoDocumento(cot.tipoDocumento),
    type_payer_pension_id: DEFAULTS.type_payer_pension_id,
    type_person_id: DEFAULTS.type_person_id_natural,
    information_contact: contact,
    extra_validation: EXTRA_VALIDATION_DEFAULT,
  };

  // Swagger PagoSimple — independent:
  //   POST /contributor      (crear, NO /independent en el path; el body
  //                          discrimina por type_person_id=1 / legal_nature)
  //   PUT  /contributor      (actualizar; +auth_token, id va en body)
  const isUpdate = Boolean(cot.pagosimpleContributorId);
  const path = '/contributor';
  const headers = isUpdate
    ? await getFullAuthHeaders({
        id: cot.numeroDocumento,
        documentType: mapTipoDocumento(cot.tipoDocumento),
        document: cot.numeroDocumento,
      })
    : await getBaseAuthHeaders();

  try {
    const data = await pagosimpleRequest<{ id?: string } | string>(path, {
      method: isUpdate ? 'PUT' : 'POST',
      headers,
      body,
    });
    const contributorId =
      typeof data === 'string' ? data : (data?.id ?? cot.pagosimpleContributorId ?? '');
    if (!contributorId) {
      return {
        ok: false,
        error: 'PagoSimple respondió sin contributor_id — no se pudo guardar el vínculo.',
      };
    }
    await prisma.cotizante.update({
      where: { id: cot.id },
      data: {
        pagosimpleContributorId: contributorId,
        pagosimpleSyncedAt: new Date(),
      },
    });
    return { ok: true, contributorId, mode: isUpdate ? 'updated' : 'created' };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return {
      ok: false,
      error: e.message ?? 'Error desconocido al sincronizar con PagoSimple',
      code: e.code,
    };
  }
}
