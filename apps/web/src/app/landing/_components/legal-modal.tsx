'use client';

/**
 * Modales legales: Términos de uso, Política de privacidad, Habeas Data.
 *
 * Contenidos base estándar para SaaS colombiano (Ley 1581 de 2012,
 * Decreto 1377 de 2013, Resolución 2388 de 2016). DRAFT — revisar con
 * abogado especialista en protección de datos antes del lanzamiento
 * público.
 *
 * Owner: Grupo de Negocios Temporales SAS — Pereira, Colombia.
 * Contacto: gerencia.gnt@gmail.com
 */

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';

type LegalDoc = 'terminos' | 'privacidad' | 'habeas-data';

const RAZON_SOCIAL = 'Grupo de Negocios Temporales SAS';
const CIUDAD = 'Pereira, Colombia';
const EMAIL = 'gerencia.gnt@gmail.com';
const FECHA_VIGENCIA = 'Mayo de 2026';

const LEGAL_DOCS: Record<LegalDoc, { title: string; subtitle: string; sections: Section[] }> = {
  terminos: {
    title: 'Términos de uso',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Aceptación',
        body: `Al acceder y/o utilizar la plataforma Sistema PILA (en adelante, "la Plataforma"), operada por ${RAZON_SOCIAL}, identificada con NIT registrado en la Cámara de Comercio de ${CIUDAD}, el usuario manifiesta haber leído, entendido y aceptado los presentes Términos de uso. Si no está de acuerdo, deberá abstenerse de utilizar la Plataforma.`,
      },
      {
        heading: '2. Descripción del servicio',
        body: `Sistema PILA es una plataforma SaaS que facilita la liquidación, validación, generación, presentación y pago de la Planilla Integrada de Liquidación de Aportes (PILA), conforme a la Resolución 2388 de 2016 del Ministerio de Salud y Protección Social y normas que la modifiquen o sustituyan. Operamos como aliados de un operador autorizado por el Ministerio de Salud para el procesamiento de la PILA. La Plataforma incluye módulos complementarios de afiliación a ARL, gestión de cartera, radicación y seguimiento de incapacidades, y soporte jurídico.`,
      },
      {
        heading: '3. Cuenta de usuario',
        body: `Para acceder a las funcionalidades, el usuario debe registrarse y mantener una cuenta activa. El usuario es responsable de la veracidad y actualización de la información suministrada, así como de la confidencialidad de sus credenciales de acceso. Cualquier actividad realizada bajo su cuenta será de su responsabilidad. Notifique inmediatamente a ${EMAIL} cualquier uso no autorizado.`,
      },
      {
        heading: '4. Obligaciones del usuario',
        body: `El usuario se compromete a: (i) usar la Plataforma de buena fe y conforme a la ley colombiana; (ii) no realizar ingeniería inversa, decompilar o intentar acceder al código fuente; (iii) no utilizar la Plataforma para actividades ilícitas, fraudulentas o que infrinjan derechos de terceros; (iv) suministrar información veraz y completa de los cotizantes y aportantes; (v) cumplir con sus obligaciones tributarias y de seguridad social derivadas del uso del servicio.`,
      },
      {
        heading: '5. Pagos y facturación',
        body: `Los servicios se facturan según el plan contratado: para empresas del sector, tarifa mensual por cotizante activo o por sucursal; para independientes, comisión transparente sobre el aporte. Los precios incluyen IVA cuando aplique. La falta de pago oportuno podrá generar suspensión temporal de los servicios previa notificación. Las disputas sobre facturación deberán reportarse a ${EMAIL} dentro de los 30 días siguientes a la emisión de la factura.`,
      },
      {
        heading: '6. Propiedad intelectual',
        body: `Todos los derechos de propiedad intelectual sobre la Plataforma, incluidos software, código fuente, marcas, logos, diseños, textos y demás contenidos, son de propiedad exclusiva de ${RAZON_SOCIAL} o de sus licenciantes. Se otorga al usuario una licencia limitada, no exclusiva, no transferible y revocable para utilizar la Plataforma conforme a estos Términos. El usuario conserva la propiedad de los datos que carga a la Plataforma.`,
      },
      {
        heading: '7. Limitación de responsabilidad',
        body: `${RAZON_SOCIAL} actúa como facilitador tecnológico. La responsabilidad final sobre la veracidad, completitud y oportunidad de la información reportada al SGSS recae en el aportante. La Plataforma se ofrece "tal cual" sin garantías de disponibilidad ininterrumpida, aunque mantenemos altos estándares de servicio. No seremos responsables por daños indirectos, lucro cesante, ni por causas de fuerza mayor o caso fortuito (incluyendo fallas de operadores externos como EPS, AFP, ARL, CCF o el operador autorizado de PILA).`,
      },
      {
        heading: '8. Modificaciones',
        body: `Nos reservamos el derecho de modificar estos Términos en cualquier momento. Las modificaciones serán comunicadas mediante la Plataforma o al correo registrado, con al menos 15 días de anticipación cuando afecten obligaciones esenciales. El uso continuado de la Plataforma tras la entrada en vigor de los cambios constituye aceptación de los mismos.`,
      },
      {
        heading: '9. Terminación',
        body: `El usuario puede cancelar su cuenta en cualquier momento contactando a ${EMAIL}. ${RAZON_SOCIAL} podrá suspender o terminar el acceso en caso de incumplimiento de estos Términos, sin perjuicio de las acciones legales correspondientes. Tras la terminación, los datos del usuario serán tratados conforme a la Política de privacidad y a la legislación vigente.`,
      },
      {
        heading: '10. Ley aplicable y jurisdicción',
        body: `Estos Términos se rigen por las leyes de la República de Colombia. Cualquier controversia será resuelta ante los jueces competentes de ${CIUDAD}, salvo que la ley imponga otra jurisdicción específica.`,
      },
      {
        heading: '11. Contacto',
        body: `Para cualquier consulta o notificación relacionada con estos Términos: ${EMAIL} · ${RAZON_SOCIAL} · ${CIUDAD}.`,
      },
    ],
  },

  privacidad: {
    title: 'Política de privacidad',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Responsable del tratamiento',
        body: `${RAZON_SOCIAL}, con domicilio en ${CIUDAD}, es responsable del tratamiento de los datos personales que recopila a través de la Plataforma Sistema PILA. Esta política se rige por la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas aplicables sobre protección de datos personales en Colombia.`,
      },
      {
        heading: '2. Datos que recopilamos',
        body: `Recopilamos datos directamente del titular o de quien lo afilia (aportante), incluyendo: (i) datos de identificación (tipo y número de documento, nombres y apellidos); (ii) datos de contacto (correo electrónico, teléfono, dirección); (iii) datos demográficos (fecha de nacimiento, género, lugar de residencia, nacionalidad); (iv) datos laborales (cargo, salario, modalidad de afiliación, fechas de ingreso/retiro, EPS, AFP, ARL, CCF); (v) datos sensibles cuando corresponda (información médica de incapacidades, novedades de incapacidad o licencia). Adicionalmente registramos datos técnicos de uso (IP, navegador, dispositivo, logs de actividad) para fines de seguridad y mejora del servicio.`,
      },
      {
        heading: '3. Finalidades del tratamiento',
        body: `Tratamos los datos personales para: (i) prestar y operar los servicios de la Plataforma; (ii) cumplir con obligaciones legales del SGSS, incluyendo la generación, validación, presentación y pago de la PILA conforme a la Resolución 2388 de 2016; (iii) gestionar la afiliación de cotizantes a entidades del SGSS (EPS, AFP, ARL, CCF) cuando el usuario lo autorice; (iv) gestionar cartera, cobranza e incapacidades; (v) atender solicitudes, peticiones, quejas y reclamos; (vi) facturar y mantener registros contables; (vii) enviar comunicaciones operativas y, previa autorización, comerciales; (viii) cumplir con obligaciones legales, regulatorias o requerimientos de autoridades competentes.`,
      },
      {
        heading: '4. Datos sensibles',
        body: `Cuando se traten datos sensibles (información médica de incapacidades, datos de salud) se solicitará autorización previa, expresa e informada del titular o de su representante legal. El tratamiento de estos datos se limita estrictamente a las finalidades autorizadas y se aplican medidas reforzadas de seguridad, incluyendo cifrado y permisos granulares de acceso.`,
      },
      {
        heading: '5. Transferencia y transmisión de datos',
        body: `Para la operación de la Plataforma, podemos transmitir datos a terceros en su rol de encargados del tratamiento, incluyendo: operador autorizado de PILA, entidades del SGSS (EPS, AFP, ARL, CCF), proveedores de infraestructura cloud (con cláusulas contractuales de protección de datos), proveedores de pasarela de pago, y autoridades competentes cuando la ley lo exija. No vendemos ni alquilamos datos personales a terceros con fines comerciales.`,
      },
      {
        heading: '6. Seguridad de la información',
        body: `Aplicamos medidas técnicas, administrativas y físicas razonables para proteger los datos contra acceso no autorizado, pérdida, alteración o destrucción. Esto incluye: cifrado en tránsito (TLS) y en reposo, control de acceso por roles, registro de auditoría de todas las operaciones críticas, copias de seguridad periódicas, y procedimientos de respuesta a incidentes de seguridad.`,
      },
      {
        heading: '7. Retención',
        body: `Los datos personales se conservan durante el tiempo necesario para cumplir las finalidades del tratamiento y las obligaciones legales aplicables (incluidas las contables, tributarias y del SGSS). Documentos adjuntos a incapacidades se conservan en disco activo hasta 120 días tras los cuales se eliminan físicamente conservando solo el registro como evidencia. Tras finalizar la relación contractual, los datos se anonimizan o eliminan de forma segura, salvo cuando la ley exija su conservación.`,
      },
      {
        heading: '8. Derechos del titular',
        body: `Conforme a la Ley 1581 de 2012, el titular tiene derecho a: (i) conocer, actualizar y rectificar sus datos personales; (ii) solicitar prueba de la autorización otorgada; (iii) ser informado del uso dado a sus datos; (iv) presentar quejas ante la Superintendencia de Industria y Comercio (SIC); (v) revocar la autorización y/o solicitar la supresión cuando no se respete la ley; (vi) acceder gratuitamente a sus datos. Para ejercer estos derechos, contacte a ${EMAIL}. Responderemos en un plazo máximo de 10 días hábiles para consultas y 15 días hábiles para reclamos, prorrogables conforme a la ley.`,
      },
      {
        heading: '9. Cookies y tecnologías similares',
        body: `Usamos cookies estrictamente necesarias para autenticación y operación del servicio. No usamos cookies de marketing ni de seguimiento de terceros sin consentimiento. El usuario puede configurar su navegador para rechazar cookies, aunque esto puede afectar la funcionalidad de la Plataforma.`,
      },
      {
        heading: '10. Modificaciones',
        body: `Esta Política puede ser modificada. Los cambios sustanciales se notificarán mediante la Plataforma o al correo registrado con al menos 15 días de anticipación. La fecha de última actualización se indica al inicio del documento.`,
      },
      {
        heading: '11. Contacto',
        body: `Oficina de Protección de Datos: ${EMAIL} · ${RAZON_SOCIAL} · ${CIUDAD}. Si considera que sus derechos han sido vulnerados, puede presentar queja ante la Superintendencia de Industria y Comercio (www.sic.gov.co).`,
      },
    ],
  },

  'habeas-data': {
    title: 'Autorización de tratamiento de datos personales (Habeas Data)',
    subtitle: `${RAZON_SOCIAL} · Conforme a la Ley 1581 de 2012`,
    sections: [
      {
        heading: 'Autorización',
        body: `El titular de los datos personales (en adelante "el Titular"), o su representante legal cuando aplique, autoriza de manera previa, expresa e informada a ${RAZON_SOCIAL}, identificada como Responsable del Tratamiento, con domicilio en ${CIUDAD}, para recolectar, almacenar, usar, circular, suprimir, procesar, compilar, intercambiar, transmitir, transferir y, en general, dar tratamiento a los datos personales suministrados, conforme a las finalidades descritas en la Política de privacidad de Sistema PILA.`,
      },
      {
        heading: 'Finalidades autorizadas',
        body: `El Titular autoriza el tratamiento de sus datos personales para: (i) la operación de los servicios contratados, incluida la generación y presentación de la Planilla Integrada de Liquidación de Aportes (PILA) ante el operador autorizado por el Ministerio de Salud; (ii) la afiliación, novedad y consulta ante entidades del SGSS (EPS, AFP, ARL, CCF); (iii) la radicación, seguimiento y cobro de incapacidades; (iv) la gestión de cartera y cobranza; (v) el cumplimiento de obligaciones legales, contables, tributarias y de seguridad social; (vi) la atención de PQRS; (vii) el envío de comunicaciones operativas relacionadas con el servicio; y, previa autorización adicional explícita, (viii) el envío de comunicaciones comerciales y de marketing.`,
      },
      {
        heading: 'Datos sensibles',
        body: `Cuando el tratamiento involucre datos sensibles (información médica de incapacidades u otros datos de salud), el Titular autoriza expresamente su tratamiento, entendiendo que dicha autorización es facultativa, no es requisito para acceder a los servicios básicos, y puede ser revocada en cualquier momento. Estos datos serán tratados con medidas reforzadas de seguridad y solo accesibles por personal autorizado.`,
      },
      {
        heading: 'Derechos del Titular',
        body: `El Titular puede ejercer los derechos consagrados en la Ley 1581 de 2012: conocer, actualizar, rectificar, suprimir sus datos, revocar la autorización, ser informado del uso, presentar consultas y reclamos. Para ello debe enviar comunicación escrita a ${EMAIL} indicando: (i) nombre completo e identificación del Titular; (ii) descripción clara de los hechos y derechos que pretende hacer valer; (iii) datos de contacto para respuesta; (iv) documentación que sustente la solicitud cuando aplique. ${RAZON_SOCIAL} responderá en los plazos legales: 10 días hábiles para consultas y 15 días hábiles para reclamos, prorrogables hasta por 5 y 8 días hábiles adicionales, respectivamente, comunicando los motivos al Titular.`,
      },
      {
        heading: 'Vigencia y revocación',
        body: `Esta autorización tiene vigencia mientras dure la relación contractual y/o las finalidades autorizadas, salvo revocación expresa por parte del Titular. La revocación podrá efectuarse por los mismos canales habilitados para el ejercicio de derechos. La revocación no afecta la licitud del tratamiento previo y puede implicar la imposibilidad de continuar prestando ciertos servicios cuando los datos sean indispensables para su operación.`,
      },
      {
        heading: 'Aceptación',
        body: `Al utilizar la Plataforma Sistema PILA, marcando la casilla de aceptación correspondiente, o continuando con el uso del servicio, el Titular declara haber leído y comprendido esta autorización, así como la Política de privacidad disponible en este sitio web, y otorga su consentimiento libre, previo, expreso e informado conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.`,
      },
      {
        heading: 'Contacto',
        body: `Inquietudes sobre esta autorización: ${EMAIL} · ${RAZON_SOCIAL} · ${CIUDAD}. Autoridad de control: Superintendencia de Industria y Comercio — www.sic.gov.co.`,
      },
    ],
  },
};

type Section = { heading: string; body: string };

export function LegalLinks() {
  const [open, setOpen] = useState<LegalDoc | null>(null);

  const links: { key: LegalDoc; label: string }[] = [
    { key: 'terminos', label: 'Términos de uso' },
    { key: 'privacidad', label: 'Política de privacidad' },
    { key: 'habeas-data', label: 'Habeas Data' },
  ];

  const current = open ? LEGAL_DOCS[open] : null;

  return (
    <>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.key}>
            <button
              type="button"
              onClick={() => setOpen(l.key)}
              className="text-left text-sm text-slate-700 transition hover:text-slate-900"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>

      {current && open && (
        <Dialog
          open
          onClose={() => setOpen(null)}
          size="xl"
          title={current.title}
          description={current.subtitle}
        >
          <div className="prose prose-slate max-w-none space-y-5 text-sm leading-relaxed text-slate-700">
            {current.sections.map((s, i) => (
              <div key={i}>
                <h3 className="font-heading text-base font-bold text-slate-900">{s.heading}</h3>
                <p className="mt-2 whitespace-pre-line">{s.body}</p>
              </div>
            ))}
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
              <strong>Nota:</strong> Este documento es una versión inicial alineada con la
              normatividad colombiana vigente (Ley 1581 de 2012, Decreto 1377 de 2013, Resolución
              2388 de 2016). Para producción, recomendamos validación por abogado especialista en
              protección de datos personales y derecho de seguridad social.
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
