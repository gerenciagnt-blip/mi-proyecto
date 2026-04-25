import { Document, Page, StyleSheet, Text, View, Image } from '@react-pdf/renderer';

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

// ===== Estilos — diseño compacto para media hoja carta (5.5" x 8.5") =====

const colors = {
  primary: '#2F80ED', // brand-blue
  primaryDark: '#1F5AAD',
  text: '#0F172A',
  textLight: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  bg: '#F8FAFC',
};

const styles = StyleSheet.create({
  // 5.5" x 8.5" = 396 x 612 puntos. Márgenes 18pt para aprovechar el espacio.
  page: {
    paddingTop: 18,
    paddingBottom: 32,
    paddingHorizontal: 18,
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: colors.text,
    lineHeight: 1.25,
  },

  // ===== Header =====
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 6,
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  logo: { width: 40, height: 40, objectFit: 'contain' },
  headerTitleBlock: { flex: 1 },
  headerTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 6.5,
    color: colors.textLight,
    marginTop: 1,
  },
  encabezadoAliado: {
    fontSize: 6,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 1.3,
  },
  headerRight: { alignItems: 'flex-end', minWidth: 90 },
  consecutivo: {
    fontSize: 10,
    fontFamily: 'Courier-Bold',
    color: colors.primary,
  },
  fecha: { fontSize: 6, color: colors.textLight, marginTop: 1 },

  // ===== Sections =====
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
    marginBottom: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // ===== Grid de 2 columnas =====
  twoCol: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },

  // ===== Datos del destinatario / detalle =====
  kvBlock: { paddingBottom: 2 },
  kvLabel: {
    fontSize: 5.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kvValue: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },

  // ===== Tabla de afiliaciones =====
  tabla: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 1,
  },
  tablaHeader: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tablaHeaderCell: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tablaRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tablaRowLast: { borderBottomWidth: 0 },
  tablaCell: { fontSize: 6.5, color: colors.text },
  tablaCellMuted: { fontSize: 5.5, color: colors.textMuted, marginTop: 1 },

  // ===== Totales =====
  totalesBox: {
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  totalLabel: { fontSize: 6.5, color: colors.textLight },
  totalValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: colors.text },
  granTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 4,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  granTotalLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  granTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },

  // ===== Footer =====
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 18,
    right: 18,
    textAlign: 'center',
    fontSize: 5.5,
    color: colors.textMuted,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 4,
    lineHeight: 1.3,
  },

  // ===== Utilidades =====
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

/** Concatena las entidades SGSS asignadas en una sola línea: "EPS / AFP / ARL / CCF". */
function entidadesLabel(a: ComprobantePdfData['afiliaciones'][number]): string {
  const partes: string[] = [];
  if (a.eps) partes.push(`EPS: ${a.eps}`);
  if (a.afp) partes.push(`AFP: ${a.afp}`);
  if (a.arl) partes.push(`ARL: ${a.arl}`);
  if (a.ccf) partes.push(`CCF: ${a.ccf}`);
  return partes.join(' · ');
}

// ===== Componente =====

/**
 * Comprobante en formato media hoja carta (5.5" x 8.5" / 396 x 612pt).
 * Diseño compacto pero legible: el header trae el logo de la sucursal a
 * la izquierda y el consecutivo + fecha a la derecha. Los datos van en
 * dos columnas (destinatario | detalle de la transacción), después la
 * tabla de afiliaciones y al final la caja de totales con el gran total
 * destacado.
 *
 * Si la sucursal subió logo en el catálogo de Formato comprobante, aquí
 * se renderiza. Si no, se muestra solo el título centrado.
 */
export function ComprobantePdf({ data }: { data: ComprobantePdfData }) {
  const tipoLabel = data.tipo === 'AFILIACION' ? 'Afiliación' : 'Mensualidad';
  const agrupacionLabel =
    data.agrupacion === 'INDIVIDUAL'
      ? 'Individual'
      : data.agrupacion === 'EMPRESA_CC'
        ? 'Empresa CC'
        : 'Asesor Comercial';

  const periodoStr = `${data.periodo.mesLabel} ${data.periodo.anio}`;

  return (
    <Document>
      <Page size={[396, 612]} style={styles.page}>
        {/* ============ Header ============ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.formato?.logoUrl ? (
              // El <Image> viene de @react-pdf/renderer — no acepta `alt`.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.logo} src={data.formato.logoUrl} />
            ) : null}
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>COMPROBANTE DE TRANSACCIÓN</Text>
              <Text style={styles.headerSubtitle}>
                {tipoLabel} · {agrupacionLabel} · {periodoStr}
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
              <Text style={styles.fecha}>
                Ext: <Text style={styles.mono}>{data.numeroComprobanteExt}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        {/* ============ Destinatario + Detalle (2 columnas) ============ */}
        <View style={styles.twoCol}>
          {/* Destinatario */}
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>{data.destinatario.etiqueta}</Text>
            <View style={styles.kvBlock}>
              <Text style={styles.kvLabel}>Nombre</Text>
              <Text style={styles.kvValue}>{data.destinatario.nombre}</Text>
            </View>
            {data.destinatario.documento ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Documento</Text>
                <Text style={[styles.kvValue, styles.mono]}>{data.destinatario.documento}</Text>
              </View>
            ) : null}
            {data.destinatario.direccion || data.destinatario.ciudad ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Ubicación</Text>
                <Text style={styles.kvValue}>
                  {[data.destinatario.direccion, data.destinatario.ciudad]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ) : null}
            {data.destinatario.telefono || data.destinatario.email ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Contacto</Text>
                <Text style={styles.kvValue}>
                  {[data.destinatario.telefono, data.destinatario.email]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Detalle de la transacción */}
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Detalle</Text>
            {data.periodoAporte ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Período de aporte (PILA)</Text>
                <Text style={styles.kvValue}>
                  {data.periodoAporte.mesLabel} {data.periodoAporte.anio}
                </Text>
              </View>
            ) : null}
            <View style={styles.kvBlock}>
              <Text style={styles.kvLabel}>Forma de pago</Text>
              <Text style={styles.kvValue}>
                {(data.formaPago && FORMA_PAGO_LABEL[data.formaPago]) ?? data.formaPago ?? '—'}
              </Text>
            </View>
            {data.medioPago ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Medio de pago</Text>
                <Text style={styles.kvValue}>
                  {data.medioPago.codigo} · {data.medioPago.nombre}
                </Text>
              </View>
            ) : null}
            {data.fechaPago ? (
              <View style={styles.kvBlock}>
                <Text style={styles.kvLabel}>Fecha de pago</Text>
                <Text style={styles.kvValue}>{data.fechaPago}</Text>
              </View>
            ) : null}
            <View style={styles.kvBlock}>
              <Text style={styles.kvLabel}>Cotizantes</Text>
              <Text style={styles.kvValue}>{data.afiliaciones.length}</Text>
            </View>
          </View>
        </View>

        {/* ============ Tabla afiliaciones ============ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Afiliaciones</Text>
          <View style={styles.tabla}>
            <View style={styles.tablaHeader}>
              <Text style={[styles.tablaHeaderCell, { width: '38%' }]}>Cotizante</Text>
              <Text style={[styles.tablaHeaderCell, { width: '14%' }]}>Modal.</Text>
              <Text style={[styles.tablaHeaderCell, { width: '14%', textAlign: 'right' }]}>
                IBC
              </Text>
              <Text style={[styles.tablaHeaderCell, { width: '8%', textAlign: 'right' }]}>
                Días
              </Text>
              <Text style={[styles.tablaHeaderCell, { width: '26%', textAlign: 'right' }]}>
                Subtotal
              </Text>
            </View>
            {data.afiliaciones.map((a, i) => {
              const isLast = i === data.afiliaciones.length - 1;
              const ents = entidadesLabel(a);
              return (
                <View key={i} style={[styles.tablaRow, isLast ? styles.tablaRowLast : {}]}>
                  <View style={{ width: '38%' }}>
                    <Text style={styles.tablaCell}>{a.nombreCotizante}</Text>
                    <Text style={[styles.tablaCellMuted, styles.mono]}>{a.documento}</Text>
                    {ents ? <Text style={styles.tablaCellMuted}>{ents}</Text> : null}
                  </View>
                  <Text style={[styles.tablaCell, { width: '14%' }]}>
                    {a.modalidad === 'DEPENDIENTE' ? 'Depend.' : 'Indep.'}
                    {a.nivelRiesgo ? ` · R${a.nivelRiesgo}` : ''}
                  </Text>
                  <Text
                    style={[styles.tablaCell, styles.mono, { width: '14%', textAlign: 'right' }]}
                  >
                    {cop(a.ibc)}
                  </Text>
                  <Text
                    style={[styles.tablaCell, styles.mono, { width: '8%', textAlign: 'right' }]}
                  >
                    {a.dias}
                  </Text>
                  <Text
                    style={[
                      styles.tablaCell,
                      styles.mono,
                      { width: '26%', textAlign: 'right' },
                      { fontFamily: 'Helvetica-Bold' },
                    ]}
                  >
                    {cop(a.subtotal)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ============ Totales ============ */}
        <View style={styles.section}>
          <View style={styles.totalesBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Aportes SGSS</Text>
              <Text style={[styles.totalValue, styles.mono]}>{cop(data.totales.sgss)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Valor administración</Text>
              <Text style={[styles.totalValue, styles.mono]}>{cop(data.totales.admon)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Servicios adicionales</Text>
              <Text style={[styles.totalValue, styles.mono]}>{cop(data.totales.servicios)}</Text>
            </View>
            <View style={styles.granTotalRow}>
              <Text style={styles.granTotalLabel}>Total a pagar</Text>
              <Text style={[styles.granTotalValue, styles.mono]}>{cop(data.totales.general)}</Text>
            </View>
          </View>
        </View>

        {/* ============ Footer ============ */}
        <View style={styles.footer} fixed>
          <Text>
            {data.formato?.pieDePagina ??
              'Este comprobante es constancia del pago realizado. Conserve el documento.'}
          </Text>
          <Text style={{ marginTop: 2 }}>Sistema PILA · Generado {data.procesadoEn}</Text>
        </View>
      </Page>
    </Document>
  );
}
