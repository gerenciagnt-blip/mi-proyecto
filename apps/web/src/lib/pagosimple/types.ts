/**
 * Types de las 6 APIs de PagoSimple PILA.
 * Basados en los Swagger JSON publicados en:
 *   https://reportes.pagosimple.com.co/developer-docs/apis/pila/
 *
 * Shape estándar de respuesta (todas las APIs):
 *   { success: boolean; code: number; data: T | null; message: string; description: string }
 */

// ============== Envoltorio estándar ======================================

export type PagosimpleResponse<T> = {
  success: boolean;
  code: number;
  data: T | null;
  message: string;
  description: string;
};

// ============== API 1 · Sesión ============================================

export type LoginRequest = {
  document_type: string;
  document: string;
  password: string;
  secret_key: string;
  nit: string;
  company: string;
};

export type LoginData = {
  session_token: string;
  token: string;
};

export type AuthData = {
  auth_token: string;
};

/** Headers auth base (sin auth_token). Se usa en endpoints "abiertos". */
export type BaseAuthHeaders = {
  nit: string;
  token: string;
  session_token: string;
};

/** Headers auth completos (con auth_token). Mayoría de endpoints. */
export type FullAuthHeaders = BaseAuthHeaders & {
  auth_token: string;
};

// ============== API 2 · Aportantes ========================================

export type ContactInformation = {
  id?: string | null;
  type_identification: string;
  identification_number: string;
  first_name: string;
  second_name?: string | null;
  surname: string;
  second_surname?: string | null;
  email: string;
  phone_number?: string | null;
  cell_phone_number?: string | null;
  extra_email?: string | null;
  fax?: string | null;
  department_code: string;
  municipal_code: string;
  address_data: {
    id?: string | null;
    road_type_id?: string | null;
    road_number?: string | null;
    full_address: string;
    additional_information?: string | null;
  };
  full_name?: string;
};

export type ExtraValidation = {
  id?: string | null;
  contributor_id?: string | null;
  sheet_duplication: 'S' | 'N';
  /** Swagger PYME tipa como Integer; en otros endpoints aparece String.
   * Aceptamos ambos para flexibilidad. */
  type_assisted_payment_voucher_id?: number | string | null;
  values_voucher: 'S' | 'N';
  new_income_withdrawal: 'S' | 'N';
  exonerated_parafiscal_payment: 'S' | 'N';
  family_compensation_fund_benefit: 'S' | 'N';
  replaces_contributing_health_administrator: 'S' | 'N';
  replaces_contributor_upc_value: 'S' | 'N';
  replaces_contributing_names: 'S' | 'N';
};

/** Request para crear/actualizar aportante independiente. */
export type ContributorIndependentRequest = {
  id?: string | null;
  economic_activity_code: string;
  classification_contributor_code: string;
  classification_contributor_id: number;
  occupational_risk_administrator_code: string;
  digit_verification: number;
  status: 'ACTIVE' | 'INACTIVE';
  presentation_format_id: number; // 1 = Único, 3 = Sucursal
  legal_nature_id: number;
  identification_number: string;
  pay_esap_min: boolean;
  business_name: string;
  type_action_id: number;
  type_contributor_id: number;
  type_identification: string;
  type_payer_pension_id: string;
  type_person_id: number; // 1 Natural, 2 Jurídica
  /** Segmento del aportante: 1=Independiente, 2=Corporativo, 3=PYME.
   * Marca el tipo de cliente en PagoSimple sin necesidad de endpoints
   * separados. */
  segment_id?: number | null;
  /** Fecha de inicio de actividades (YYYY-MM-DD). Validación implícita
   * en backend aunque no aparezca explícita en el OpenAPI schema. */
  start_activity?: string | null;
  information_contact: ContactInformation;
  extra_validation: ExtraValidation;
};

/** Sucursal dentro de un aportante corporativo. */
export type ContributorBranch = {
  id?: string | null;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  name: string;
  information_contact: ContactInformation;
  type_contributor_id: string;
  classification_contributor_id: string;
  legal_nature_id: string;
};

/** Request para crear/actualizar aportante corporativo. */
export type ContributorCorporateRequest = ContributorIndependentRequest & {
  business_contact_information: ContactInformation;
  legal_representative: ContactInformation;
  branches: ContributorBranch[];
};

export type Segment = {
  id: string;
  code: 'INDEPENDIENTE' | 'CORPORATIVO' | 'PYME';
  description: string;
};

/** Aportante devuelto por GET /contributor/{independent|corporate}/{id}. */
export type ContributorGeneral = {
  id: string;
  type_identification: string;
  identification_number: string;
  business_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  digit_verification?: number;
  economic_activity_code?: string;
  occupational_risk_administrator_code?: string;
  presentation_format_id?: number;
  legal_nature_id?: number;
  type_contributor_id?: number;
  type_person_id?: number;
  contact_information?: ContactInformation;
  extra_validation?: ExtraValidation;
  segment?: Segment;
  // Específicos de corporativo
  business_contact_information?: ContactInformation;
  legal_representative?: ContactInformation;
  branches?: ContributorBranch[];
};

// ============== API 3 · Planillas =========================================

export type PayrollAdministratorTotal = {
  administrator_code: string;
  administrator_name: string;
  administrator_type: string; // EPS, AFP, ARL, CCF, SENA, ICBF
  total_without_arrear: number;
  arrear_value: number;
  total: number;
};

export type PayrollTotalResponse = {
  document_type: string;
  document_number: string;
  contributor_name: string;
  payroll_number: number;
  quote_period: string; // YYYYMM
  affiliates_number: number;
  payroll_status: string; // GU (guardada), etc.
  administrator_total_value: PayrollAdministratorTotal[];
  total_to_pay: number;
};

export type PayrollValidationExecutionParams = {
  is_UGPP: boolean;
  is_novelties_planillaN: boolean;
  file_type: 'I' | 'E' | 'Y' | 'N' | 'A' | 'K' | 'S';
};

export type PayrollValidationDetailItem = {
  description: string;
  identification: string;
  autocorrect: 'Si' | 'No';
  initial_position?: string;
  final_position?: string;
  row: string;
};

export type PayrollValidationItem = {
  payroll_code: number;
  payroll_number: number;
  number_errors_contributor: number;
  number_errors_company: number;
  number_warnings: number;
  detail_errors_contributor: PayrollValidationDetailItem[];
  detail_errors_company: PayrollValidationDetailItem[];
  detail_warnings: PayrollValidationDetailItem[];
};

export type PayrollValidateResponse = {
  validation_status: 'OK' | 'ERROR' | 'WARNING' | string;
  payroll_validations: PayrollValidationItem[];
};

export type PayrollCorrectionRequest = {
  payroll_code: string;
  is_UGPP: boolean;
  is_novelties_planillaN: boolean;
};

export type PayrollInconsistenciesResponse = {
  limit: number;
  init_record: number;
  inconsistencies_number: number;
  detail_errors_contributor: PayrollValidationDetailItem[];
  detail_errors_company: PayrollValidationDetailItem[];
  detail_warnings: PayrollValidationDetailItem[];
};

export type BduaRuafRequest = {
  document_type: string;
  document: string;
};

export type BduaRuafItem = {
  affiliate_type: string; // C (cotizante), B (beneficiario)
  document_type: string;
  document: string;
  first_last_name?: string;
  second_last_name?: string;
  first_name?: string;
  second_name?: string;
  bdua_eps_code?: string;
  bdua_administrator_name?: string;
  bdua_affiliate_date?: string; // YYYYMMDD
  ruaf_afp_code?: string;
  ruaf_administrator_name?: string;
  ruaf_affiliate_date?: string;
  is_pensionary?: 'SI' | 'NO';
};

// ============== API 4 · Marcación Asistida ================================

export type PayrollMarkingIndividualRequest = {
  payrollNumber: string;
  causeException: string;
};

export type PayrollMarkingIndividualResponse = {
  payrollNumber: string;
  pinNumber: string;
};

export type PayrollMarkingMassiveResponse = {
  statusProcess: 'EN PROCESO' | 'TERMINADO' | string;
  loadId: string;
  exceptionName: string | null;
  validation: unknown;
  fileInfo: unknown;
};

export type PayrollMarkingQueryResponse = {
  /** Archivo Excel (zip) resultado, en base64. */
  result: string;
};

// ============== API 5 · Comprobantes ======================================

export type VoucherIndividualRequest = {
  payroll_number?: string | null;
  init_payment_date?: string | null; // YYYY-MM-DD
  end_payment_date?: string | null;
  branch_code?: string | null;
  quote_period?: string | null; // YYYYMM
  identification: {
    document_type: string;
    document: string;
  };
};

export type VoucherReportTypesRequest = {
  document_type: string;
  document: string;
  quote_period: string; // YYYYMM
  payroll_number?: string | null;
  branch_code?: string | null;
  workplace_center?: string | null;
  report_type: '1' | '2'; // 1=prefactura, 2=comprobante
};

// `data` en ambos es PDF en base64
export type VoucherPdfBase64 = string;

// ============== API 6 · Pagos =============================================

/** URL PSE devuelta por GET /payroll/payment/{payroll_number}. */
export type PaymentUrlData = string;

export type ConsultPayrollResponse = {
  contributor_document_type: string;
  contributor_document_number: string;
  contributor_name: string;
  quotation_period: string; // YYYYMM
  total_to_pay: string; // numérico serializado
};

export type PayPayrollRequest = {
  agreement_code: string;
  correspondent_code: string;
  pin_number: string;
  document_type: string;
  document_number: string;
  quotation_period: string;
  total_value: string;
};

export type PayPayrollResponse = {
  message: string;
};
