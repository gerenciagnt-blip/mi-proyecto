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
/**
 * Defaults extraídos del Swagger oficial de PagoSimple. Los valores
 * pequeños y los códigos alfa son los que la API valida — usar los
 * "típicos PILA" (50, 52, etc.) hace que rechace.
 *
 * Catálogo confirmado:
 *   - segment_id:                       1=Indep, 2=Corp, 3=PYME
 *   - classification_contributor_code:  "I"=Indep, "B"=Empleador
 *   - legal_nature_id:                  1=Natural, 2=Jurídica
 *   - type_assisted_payment_voucher_id: 2 (default ejemplo del Swagger)
 *   - presentation_format_id:           1=Único, 3=Sucursal
 *   - type_person_id:                   1=Natural, 2=Jurídica
 */
const DEFAULTS = {
  presentation_format_id: 1,
  legal_nature_id_juridica: 2,
  legal_nature_id_natural: 1,
  /** "B" = Empleador / aportante con vínculo laboral (PYME). */
  classification_contributor_code_corporate: 'B',
  classification_contributor_id_corporate: 2,
  /** "I" = Independiente. */
  classification_contributor_code_independent: 'I',
  classification_contributor_id_independent: 5,
  type_action_id: 1,
  type_contributor_id: 1,
  type_payer_pension_id: '1',
  type_person_id_natural: 1,
  type_person_id_juridica: 2,
  /** Segmentos PagoSimple. Sistema PILA solo maneja Indep + PYME. */
  segment_independiente: 1,
  segment_corporativo: 2,
  segment_pyme: 3,
} as const;

const EXTRA_VALIDATION_DEFAULT: ExtraValidation = {
  sheet_duplication: 'N',
  /** En PYME es Integer (2 según ejemplo). Nota: el endpoint corporate
   * lo tipa como String — si vamos a soportar ambos, ajustar por flujo. */
  type_assisted_payment_voucher_id: 2,
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

/**
 * Formatea una fecha al formato que espera PagoSimple para
 * `start_activity` (YYYY-MM-DD). Acepta Date o null/undefined; en
 * caso de no haber fecha, retorna 1 año atrás como aproximación.
 */
function formatStartActivity(d: Date | null | undefined): string {
  const date = d ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** Default para empresas/cotizantes legacy sin fecha capturada. */
function fechaInicioActividadesPasada(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
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
  if (!empresa.telefono) missing.push('teléfono');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Faltan datos obligatorios en la empresa: ${missing.join(', ')}.`,
    };
  }

  const dv = empresa.dv ? Number(empresa.dv) : calcularDv(empresa.nit);

  // PagoSimple requiere phone_number Y cell_phone_number en TODOS los
  // contactos del request. Usamos el mismo número en ambos por ahora.
  const tel = empresa.telefono!;

  const companyContact: ContactInformation = {
    type_identification: 'NI',
    identification_number: empresa.nit,
    first_name: empresa.nombre,
    surname: empresa.nombre, // para personas jurídicas PagoSimple usa business_name aparte, pero first_name/surname son obligatorios
    email: empresa.email!,
    phone_number: tel,
    cell_phone_number: tel,
    department_code: empresa.departamentoRef!.codigo,
    municipal_code: empresa.municipioRef!.codigo,
    address_data: {
      full_address: empresa.direccion!,
    },
  };

  // Representante legal y contacto comercial — DEBEN ser personas naturales
  // (PagoSimple solo acepta CC/CE/TI/PA/CD/SC/PT/PE/RC en estos campos,
  // NO acepta NI). Si falta repLegal, usamos placeholders básicos y el
  // usuario los corrige luego en /admin/empresas/[id].
  const repLegalDoc = empresa.repLegalNumeroDoc?.trim() || '0';
  const repLegalTipo = empresa.repLegalTipoDoc ?? 'CC';
  const repLegalNombreFull = (empresa.repLegalNombre ?? 'Representante Legal').trim();
  const repLegalParts = repLegalNombreFull.split(/\s+/);
  const repLegalFirstName = repLegalParts[0] ?? 'Representante';
  const repLegalSurname = repLegalParts.slice(1).join(' ') || 'Legal';

  const legalRep: ContactInformation = {
    type_identification: repLegalTipo,
    identification_number: repLegalDoc,
    first_name: repLegalFirstName,
    surname: repLegalSurname,
    email: empresa.email!,
    phone_number: tel,
    cell_phone_number: tel,
    department_code: empresa.departamentoRef!.codigo,
    municipal_code: empresa.municipioRef!.codigo,
    address_data: { full_address: empresa.direccion! },
  };

  // El "business contact" también es persona natural (mismo formato que
  // legalRep). Reutilizamos por simplicidad — en la mayoría de pymes
  // coincide con el rep legal.
  const businessContact: ContactInformation = legalRep;

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
    /** PYME — Sistema PILA solo maneja Indep + PYME (no Corporativo). */
    segment_id: DEFAULTS.segment_pyme,
    information_contact: companyContact,
    business_contact_information: businessContact,
    legal_representative: legalRep,
    branches: [],
    extra_validation: EXTRA_VALIDATION_DEFAULT,
  };

  // Swagger PagoSimple — PYME (Sistema PILA solo maneja Indep + PYME):
  //   POST /contributor/pyme   (crear)  → headers: nit+token+session
  //   PUT  /contributor/pyme   (actualizar) → +auth_token, id en body
  const isUpdate = Boolean(empresa.pagosimpleContributorId);
  const path = '/contributor/pyme';
  let headers: Awaited<ReturnType<typeof getBaseAuthHeaders>>;
  try {
    headers = isUpdate
      ? await getFullAuthHeaders({
          id: empresa.nit,
          documentType: 'NI',
          document: empresa.nit,
        })
      : await getBaseAuthHeaders();
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

  // PENDIENTE: el backend de /contributor/pyme rechaza con
  //   "Debe registrar una fecha de inicio de actividades"
  // pero ningún schema del Swagger documenta ese campo en el request.
  // Capturar request real desde el panel web de PagoSimple (DevTools)
  // para confirmar el nombre exacto del campo. Mientras tanto, mandamos
  // `start_activity` que es lo único razonable según el response schema.
  const fechaIso =
    empresa.fechaInicioActividades?.toISOString().slice(0, 10) ??
    new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const bodyConFecha: ContributorCorporateRequest = {
    ...body,
    start_activity: fechaIso,
  };

  try {
    const data = await pagosimpleRequest<{ id?: string } | string>(path, {
      method: isUpdate ? 'PUT' : 'POST',
      headers,
      body: bodyConFecha,
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
  if (!cot.telefono && !cot.celular) missing.push('teléfono o celular');
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

  // Garantizamos teléfono y celular en ambos campos. Si solo hay uno,
  // lo replicamos — PagoSimple los exige ambos.
  const tel = cot.telefono ?? cot.celular ?? '';
  const cell = cot.celular ?? cot.telefono ?? '';

  const contact: ContactInformation = {
    type_identification: mapTipoDocumento(cot.tipoDocumento),
    identification_number: cot.numeroDocumento,
    first_name: cot.primerNombre,
    second_name: cot.segundoNombre ?? null,
    surname: cot.primerApellido,
    second_surname: cot.segundoApellido ?? null,
    email: cot.email!,
    phone_number: tel,
    cell_phone_number: cell,
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
    /** Independiente (segment_id=1). */
    segment_id: DEFAULTS.segment_independiente,
    information_contact: contact,
    extra_validation: EXTRA_VALIDATION_DEFAULT,
  };

  // Swagger PagoSimple — independent:
  //   POST /contributor      (crear, NO /independent en el path; el body
  //                          discrimina por type_person_id=1 / legal_nature)
  //   PUT  /contributor      (actualizar; +auth_token, id va en body)
  const isUpdate = Boolean(cot.pagosimpleContributorId);
  const path = '/contributor';
  let headers: Awaited<ReturnType<typeof getBaseAuthHeaders>>;
  try {
    headers = isUpdate
      ? await getFullAuthHeaders({
          id: cot.numeroDocumento,
          documentType: mapTipoDocumento(cot.tipoDocumento),
          document: cot.numeroDocumento,
        })
      : await getBaseAuthHeaders();
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    return { ok: false, error: `Auth PagoSimple falló: ${msg}` };
  }

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
