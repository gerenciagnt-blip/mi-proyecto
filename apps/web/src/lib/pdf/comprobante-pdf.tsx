import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
} from '@react-pdf/renderer';

// ===== Tipos =====

export type ComprobantePdfData = {
  consecutivo: string;
  tipo: 'AFILIACION' | 'MENSUALIDAD';
  agrupacion: 'INDIVIDUAL' | 'EMPRESA_CC' | 'ASESOR_COMERCIAL';
  emitidoEn: string; // fecha formateada dd/mm/yyyy
  procesadoEn: string;
  numeroComprobanteExt?: string | null;
  formaPago?: string | null;
  medioPago?: { codigo: string; nombre: string } | null;
  fechaPago?: string | null;

  periodo: { anio: number; mes: number; mesLabel: string };
  /** Período al que corresponde el aporte SGSS (PILA) cuando difiere del
   * periodo contable. Útil para independientes con forma de pago VENCIDO. */
  periodoAporte?: { anio: number; mes: number; mesLabel: string } | null;

  destinatario: {
    etiqueta: string; // "Cotizante" | "Empresa CC" | "Asesor"
    nombre: string;
    documento?: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    email?: string;
  };

  afiliaciones: Array<{
    nombreCotizante: string;
    documento: string;
    modalidad: string;
    nivelRiesgo: string;
    empresa: string | null;
    ibc: number;
    dias: number;
    // Entidades SGSS asignadas
    eps?: string | null;
    afp?: string | null;
    arl?: string | null;
    ccf?: string | null;
    subtotal: number;
  }>;

  totales: {
    sgss: number;
    admon: number;
    servicios: number;
    general: number;
  };

  // Formato del comprobante (sucursal) — opcional
  formato?: {
    nombre: string;
    logoUrl?: string | null;
    encabezado?: string | null;
    pieDePagina?: string | null;
  } | null;
};

// ===== Estilos =====

const colors = {
  primary: '#2F80ED', // brand-blue
  primaryDark: '#1F5AAD',
  text: '#0F172A',
  textLight: '#64748B',
  border: '#E2E8F0',
  bg: '#F8FAFC',
  success: '#059669',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.text,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
  },
  headerSubtitle: { fontSize: 9, color: colors.textLight, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  consecutivo: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  fecha: { fontSize: 9, color: colors.textLight, marginTop: 2 },

  encabezadoAliado: {
    fontSize: 8,
    color: colors.textLight,
    marginTop: 6,
    lineHeight: 1.4,
  },

  // Sections
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Grid de datos
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', paddingBottom: 4 },
  label: { fontSize: 8, color: colors.textLight, marginBottom: 1 },
  value: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.text },

  // Tabla entidades
  tabla: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tablaHeader: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tablaHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tablaRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tablaRowLast: { borderBottomWidth: 0 },
  tablaCell: { fontSize: 8.5, color: colors.text },

  // Totales
  totalesBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 12,
    borderRadius: 3,
    marginTop: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 9, color: colors.textLight },
  totalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.text },
  granTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  granTotalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
    textTransform: 'uppercase',
  },
  granTotalValue: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },

  // Detalle de transacción
  detalleTx: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.bg,
    padding: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  detalleItem: { width: '50%', paddingBottom: 6 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: colors.textLight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  footerLine: { lineHeight: 1.4 },

  // Utilidades
  mono: { fontFamily: 'Courier' },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
});

// ===== Helpers =====

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

const FORMA_PAGO_LABEL: Record<string, string> = {
  POR_CONFIGURACION: 'Por configuración',
  CONSOLIDADO: 'Consolidado',
  POR_MEDIO_PAGO: 'Medio de pago',
};

// ===== Componente =====

export function ComprobantePdf({ data }: { data: ComprobantePdfData }) {
  const tipoLabel = data.tipo === 'AFILIACION' ? 'Afiliación' : 'Mensualidad';
  const agrupacionLabel =
    data.agrupacion === 'INDIVIDUAL'
      ? 'Individual'
      : data.agrupacion === 'EMPRESA_CC'
        ? 'Empresa CC'
        : 'Asesor Comercial';

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.formato?.logoUrl ? (
              // El <Image> viene de @react-pdf/renderer — no acepta `alt`.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.logo} src={data.formato.logoUrl} />
            ) : null}
            <View>
              <Text style={styles.headerTitle}>COMPROBANTE DE TRANSACCIÓN</Text>
              <Text style={styles.headerSubtitle}>
                {tipoLabel} · {agrupacionLabel} · Período {data.periodo.mesLabel}{' '}
                {data.periodo.anio}
              </Text>
              {data.formato?.encabezado ? (
                <Text style={styles.encabezadoAliado}>{data.formato.encabezado}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.consecutivo}>{data.consecutivo}</Text>
            <Text style={styles.fecha}>Emitido {data.procesadoEn}</Text>
            {data.numeroComprobanteExt ? (
              <Text style={styles.fecha}>Ext: {data.numeroComprobanteExt}</Text>
            ) : null}
          </View>
        </View>

        {/* Destinatario */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.destinatario.etiqueta}</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Nombre / Razón Social</Text>
              <Text style={styles.value}>{data.destinatario.nombre}</Text>
            </View>
            {data.destinatario.documento ? (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Documento</Text>
                <Text style={[styles.value, styles.mono]}>
                  {data.destinatario.documento}
                </Text>
              </View>
            ) : null}
            {data.destinatario.direccion ? (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Dirección</Text>
                <Text style={styles.value}>{data.destinatario.direccion}</Text>
              </View>
            ) : null}
            {data.destinatario.ciudad ? (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Ciudad</Text>
                <Text style={styles.value}>{data.destinatario.ciudad}</Text>
              </View>
            ) : null}
            {data.destinatario.telefono ? (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Teléfono</Text>
                <Text style={styles.value}>{data.destinatario.telefono}</Text>
              </View>
            ) : null}
            {data.destinatario.email ? (
              <View style={styles.gridItem}>
                <Text style={styles.label}>Correo</Text>
                <Text style={styles.value}>{data.destinatario.email}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Entidades SGSS + Afiliaciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Entidades SGSS</Text>
          <View style={styles.tabla}>
            <View style={styles.tablaHeader}>
              <Text style={[styles.tablaHeaderCell, { width: '22%' }]}>Cotizante</Text>
              <Text style={[styles.tablaHeaderCell, { width: '14%' }]}>Doc.</Text>
              <Text style={[styles.tablaHeaderCell, { width: '14%' }]}>EPS</Text>
              <Text style={[styles.tablaHeaderCell, { width: '14%' }]}>AFP</Text>
              <Text style={[styles.tablaHeaderCell, { width: '10%' }]}>ARL</Text>
              <Text style={[styles.tablaHeaderCell, { width: '10%' }]}>CCF</Text>
              <Text
                style={[
                  styles.tablaHeaderCell,
                  { width: '16%', textAlign: 'right' },
                ]}
              >
                Subtotal
              </Text>
            </View>
            {data.afiliaciones.map((a, i) => {
              const isLast = i === data.afiliaciones.length - 1;
              return (
                <View
                  key={i}
                  style={[styles.tablaRow, isLast ? styles.tablaRowLast : {}]}
                >
                  <Text style={[styles.tablaCell, { width: '22%' }]}>
                    {a.nombreCotizante}
                  </Text>
                  <Text
                    style={[styles.tablaCell, styles.mono, { width: '14%' }]}
                  >
                    {a.documento}
                  </Text>
                  <Text style={[styles.tablaCell, { width: '14%' }]}>
                    {a.eps ?? '—'}
                  </Text>
                  <Text style={[styles.tablaCell, { width: '14%' }]}>
                    {a.afp ?? '—'}
                  </Text>
                  <Text style={[styles.tablaCell, { width: '10%' }]}>
                    {a.arl ?? '—'}
                  </Text>
                  <Text style={[styles.tablaCell, { width: '10%' }]}>
                    {a.ccf ?? '—'}
                  </Text>
                  <Text
                    style={[
                      styles.tablaCell,
                      styles.mono,
                      { width: '16%', textAlign: 'right' },
                    ]}
                  >
                    {cop(a.subtotal)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Totales — solo suma final */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          <View style={styles.totalesBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Aportes SGSS</Text>
              <Text style={[styles.totalValue, styles.mono]}>
                {cop(data.totales.sgss)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Valor administración</Text>
              <Text style={[styles.totalValue, styles.mono]}>
                {cop(data.totales.admon)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Servicios adicionales</Text>
              <Text style={[styles.totalValue, styles.mono]}>
                {cop(data.totales.servicios)}
              </Text>
            </View>
            <View style={styles.granTotalRow}>
              <Text style={styles.granTotalLabel}>Total a pagar</Text>
              <Text style={[styles.granTotalValue, styles.mono]}>
                {cop(data.totales.general)}
              </Text>
            </View>
          </View>
        </View>

        {/* Detalle de transacción */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle de la transacción</Text>
          <View style={styles.detalleTx}>
            <View style={styles.detalleItem}>
              <Text style={styles.label}>Consecutivo</Text>
              <Text style={[styles.value, styles.mono]}>{data.consecutivo}</Text>
            </View>
            <View style={styles.detalleItem}>
              <Text style={styles.label}>Período contable</Text>
              <Text style={styles.value}>
                {data.periodo.anio}-{String(data.periodo.mes).padStart(2, '0')}
              </Text>
            </View>
            {data.periodoAporte ? (
              <View style={styles.detalleItem}>
                <Text style={styles.label}>Período de aporte (PILA)</Text>
                <Text style={styles.value}>
                  {data.periodoAporte.anio}-
                  {String(data.periodoAporte.mes).padStart(2, '0')} ·{' '}
                  {data.periodoAporte.mesLabel}
                </Text>
              </View>
            ) : null}
            <View style={styles.detalleItem}>
              <Text style={styles.label}>Tipo</Text>
              <Text style={styles.value}>{tipoLabel}</Text>
            </View>
            <View style={styles.detalleItem}>
              <Text style={styles.label}>Agrupación</Text>
              <Text style={styles.value}>{agrupacionLabel}</Text>
            </View>
            <View style={styles.detalleItem}>
              <Text style={styles.label}>Forma de pago</Text>
              <Text style={styles.value}>
                {(data.formaPago && FORMA_PAGO_LABEL[data.formaPago]) ??
                  data.formaPago ??
                  '—'}
              </Text>
            </View>
            {data.medioPago ? (
              <View style={styles.detalleItem}>
                <Text style={styles.label}>Medio de pago</Text>
                <Text style={styles.value}>
                  {data.medioPago.codigo} · {data.medioPago.nombre}
                </Text>
              </View>
            ) : null}
            {data.fechaPago ? (
              <View style={styles.detalleItem}>
                <Text style={styles.label}>Fecha de pago</Text>
                <Text style={styles.value}>{data.fechaPago}</Text>
              </View>
            ) : null}
            {data.numeroComprobanteExt ? (
              <View style={styles.detalleItem}>
                <Text style={styles.label}>Número externo</Text>
                <Text style={[styles.value, styles.mono]}>
                  {data.numeroComprobanteExt}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLine}>
            {data.formato?.pieDePagina ??
              'Este comprobante es constancia del pago realizado. Conserve el documento para efectos legales y contables.'}
          </Text>
          <Text style={[styles.footerLine, { marginTop: 3 }]}>
            Generado por Sistema PILA · {data.procesadoEn}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
