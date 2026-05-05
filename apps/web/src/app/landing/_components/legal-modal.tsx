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
const NIT = '[NIT a completar]';
const MATRICULA = '[Matrícula CCP a completar]';
const DIRECCION_FISICA = '[Dirección física en Pereira a completar]';
const WEBSITE_URL = '[URL del sitio web a completar]';
const NOMBRE_PLATAFORMA = 'Sistema PILA';

const LEGAL_DOCS: Record<LegalDoc, { title: string; subtitle: string; sections: Section[] }> = {
  terminos: {
    title: 'Términos y condiciones de uso',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Identificación del prestador y aceptación',
        body: `Los presentes Términos y condiciones de uso (en adelante, los "Términos") regulan el acceso y la utilización de la plataforma ${NOMBRE_PLATAFORMA} (en adelante, la "Plataforma") y de los servicios complementarios prestados a través de la misma.

El prestador del servicio es ${RAZON_SOCIAL}, sociedad por acciones simplificada constituida bajo las leyes de la República de Colombia, identificada con NIT ${NIT}, inscrita en el Registro Mercantil de la Cámara de Comercio de Pereira bajo la matrícula ${MATRICULA}, con domicilio principal en ${DIRECCION_FISICA}, ${CIUDAD}, sitio web ${WEBSITE_URL} y correo electrónico de contacto ${EMAIL} (en adelante, "${RAZON_SOCIAL}", "nosotros" o el "Prestador").

Al registrarse, acceder o utilizar la Plataforma de cualquier forma, el Usuario declara que: (i) ha leído íntegramente, comprende y acepta sin reservas estos Términos, la Política de privacidad y la Autorización de tratamiento de datos personales; (ii) cuenta con plena capacidad legal para contratar conforme al artículo 1502 del Código Civil colombiano y, cuando actúa en nombre de una persona jurídica, está debidamente facultado para obligarla; (iii) los datos suministrados son veraces, exactos y actualizados. Si el Usuario no está de acuerdo con cualquiera de estas disposiciones, deberá abstenerse de registrarse y de usar la Plataforma.`,
      },
      {
        heading: '2. Definiciones',
        body: `Para efectos de estos Términos, se entenderá por:

• "Plataforma": el software como servicio (SaaS) ${NOMBRE_PLATAFORMA}, incluidos sus aplicativos web, APIs, módulos, integraciones, contenidos y soportes asociados.

• "Usuario": cualquier persona natural o jurídica que acceda, se registre o use la Plataforma. Incluye al Usuario Empresa (B2B) y al Usuario Independiente (B2C).

• "Usuario Empresa" o "Cliente B2B": persona jurídica o natural comerciante (asesor, operador, gestor de nómina, contador, prestador de servicios de seguridad social) que contrata el servicio en el marco de su actividad empresarial o profesional.

• "Usuario Independiente" o "Consumidor B2C": persona natural que cotiza al Sistema General de Seguridad Social (SGSS) como independiente y contrata el servicio para fines personales o domésticos no relacionados con su actividad económica empresarial. A este Usuario le aplica el Estatuto del Consumidor (Ley 1480 de 2011).

• "Aportante": persona natural o jurídica obligada a efectuar aportes al SGSS en relación con uno o más Cotizantes.

• "Cotizante": persona natural respecto de la cual se liquidan y pagan aportes al SGSS.

• "PILA": Planilla Integrada de Liquidación de Aportes regulada por la Resolución 2388 de 2016 del Ministerio de Salud y Protección Social, sus modificatorias y demás normatividad concordante.

• "Operador Autorizado": persona jurídica autorizada por el Ministerio de Salud y Protección Social para operar la PILA conforme a la Resolución 2388 de 2016. ${RAZON_SOCIAL} NO es Operador Autorizado; opera como aliado tecnológico-comercial de uno o varios Operadores Autorizados.

• "Entidades del SGSS": EPS, AFP (régimen de prima media o ahorro individual), ARL, Cajas de Compensación Familiar (CCF), ICBF, SENA y demás entidades del Sistema.

• "Cuenta": registro habilitado a un Usuario para acceder a la Plataforma mediante credenciales personales e intransferibles.

• "Datos Personales": tendrá el alcance del literal c) del artículo 3 de la Ley 1581 de 2012.`,
      },
      {
        heading: '3. Descripción del servicio: lo que SÍ y lo que NO hace la Plataforma',
        body: `${NOMBRE_PLATAFORMA} es una plataforma SaaS multi-tenant que ofrece, según el plan contratado, las siguientes funcionalidades:

(a) Liquidación, validación y generación de la PILA, así como su radicación a través del Operador Autorizado aliado.
(b) Automatización de afiliaciones, novedades y consultas ante Entidades del SGSS.
(c) Gestión de cartera, recaudo y conciliación de aportes.
(d) Radicación y seguimiento de incapacidades, con cargue de soportes médicos y comunicación con EPS/ARL.
(e) Soporte jurídico operativo (apoyo en derechos de petición, tutelas, desacatos y resoluciones relacionadas con seguridad social).
(f) Bitácora, reportes y trazabilidad de operaciones.

LIMITACIONES Y EXCLUSIONES EXPRESAS. ${RAZON_SOCIAL} declara y el Usuario reconoce que:

(i) ${RAZON_SOCIAL} NO es Operador de Información de PILA autorizado por el Ministerio de Salud y Protección Social. Actúa como aliado del Operador Autorizado, quien es responsable directo del servicio de operación de la PILA en los términos de la Resolución 2388 de 2016.

(ii) La Plataforma NO sustituye la asesoría legal, contable, tributaria, laboral o financiera profesional. La información, alertas, plantillas o sugerencias que la Plataforma genere son apoyos operativos, no constituyen asesoría profesional vinculante y no eximen al Usuario de su deber de cumplir directamente con la normatividad aplicable.

(iii) ${RAZON_SOCIAL} NO es ni actúa como EPS, AFP, ARL, CCF, banco, pasarela de pagos, recaudador, ni autoridad pública. La oportunidad y suficiencia del aporte dependen del Usuario y de las entidades del SGSS.

(iv) ${RAZON_SOCIAL} NO garantiza decisiones favorables de las entidades del SGSS frente a incapacidades, calificaciones, pagos, devoluciones, autorizaciones o cualquier trámite cuyo desenlace dependa de un tercero.

(v) ${RAZON_SOCIAL} NO almacena ni administra dineros del Usuario; los pagos de aportes se procesan a través del Operador Autorizado y/o pasarelas y entidades financieras autorizadas.`,
      },
      {
        heading: '4. Registro, verificación de identidad y cuenta',
        body: `Para usar la Plataforma, el Usuario debe crear una Cuenta suministrando información veraz, exacta, completa y actualizada. ${RAZON_SOCIAL} podrá solicitar documentos de identificación (cédula de ciudadanía, RUT, certificado de existencia y representación legal, poderes, etc.) y aplicar procedimientos de verificación de identidad y conocimiento del cliente, conforme a la normatividad aplicable y a sus políticas internas de prevención del fraude y del lavado de activos.

El Usuario es el único responsable de la confidencialidad de sus credenciales y de cualquier actividad realizada en su Cuenta. Las sesiones tienen una duración limitada por seguridad (token de sesión con expiración corta y renovación). El Usuario se obliga a notificar inmediatamente a ${EMAIL} cualquier uso no autorizado, sospecha de compromiso de credenciales o pérdida de control sobre la Cuenta.

${RAZON_SOCIAL} podrá rechazar el registro, suspender o cancelar Cuentas cuando detecte información falsa, suplantación, uso fraudulento, riesgo reputacional o incumplimiento de estos Términos.`,
      },
      {
        heading: '5. Obligaciones y conductas prohibidas del Usuario',
        body: `El Usuario se obliga a:

(a) Usar la Plataforma de buena fe y conforme a la Constitución, la ley colombiana y estos Términos.
(b) Suministrar información veraz, completa y actualizada de Aportantes, Cotizantes, novedades laborales, ingresos base de cotización (IBC) y demás datos requeridos para la liquidación de la PILA.
(c) Cumplir con sus propias obligaciones tributarias, contables, laborales y de seguridad social, incluyendo, cuando se trate de Usuarios Independientes, lo dispuesto en el Decreto 1273 de 2018 sobre el pago mes vencido de aportes y los retenciones a cargo de quienes contratan sus servicios.
(d) Mantener al día sus datos de facturación, notificación y contacto.
(e) Respetar los derechos de propiedad intelectual del Prestador y de terceros.

Quedan expresamente PROHIBIDAS las siguientes conductas:

(i) Realizar ingeniería inversa, decompilar, desensamblar, descompilar, copiar, modificar o crear obras derivadas del software, salvo en los casos expresamente permitidos por la ley.
(ii) Acceder o intentar acceder a Cuentas, datos, infraestructura o información de otros Usuarios, así como interferir con la operación o seguridad de la Plataforma (ataques, escaneo no autorizado, inyección de código, scraping masivo, etc.).
(iii) Usar la Plataforma para suplantar personas, falsificar información, evadir aportes, defraudar al SGSS, lavar activos o financiar actividades ilícitas.
(iv) Cargar archivos con virus, malware, código malicioso o contenido ilegal.
(v) Revender, sublicenciar o explotar comercialmente la Plataforma sin autorización escrita del Prestador.
(vi) Usar la Plataforma para enviar comunicaciones no solicitadas (spam) a terceros.

El incumplimiento de estas obligaciones podrá dar lugar a suspensión inmediata, terminación del servicio y acciones legales civiles y/o penales.`,
      },
      {
        heading: '6. Modelo comercial, tarifas y facturación',
        body: `${RAZON_SOCIAL} ofrece planes diferenciados según el segmento del Usuario:

(a) Para Usuarios Empresa (B2B): tarifas por suscripción mensual, por número de cotizantes activos, por sucursal, por volumen procesado, o esquemas mixtos, conforme a cotización u orden de servicio aceptada por el Cliente. Los planes pueden incluir cargos por implementación, integraciones a la medida y servicios profesionales.

(b) Para Usuarios Independientes (B2C): comisión sobre el aporte gestionado, tarifa fija mensual o esquema híbrido, comunicada de manera clara y previa antes del pago, conforme al artículo 26 de la Ley 1480 de 2011 (Estatuto del Consumidor).

Las tarifas vigentes son las publicadas en la Plataforma o las pactadas en el documento comercial firmado con el Cliente. Los valores expresados en pesos colombianos se entienden SIN IVA, salvo cuando expresamente se indique lo contrario; el IVA se liquidará y facturará a la tarifa legal vigente cuando aplique.

Ciclo de cobro: la facturación se realiza por períodos anticipados o vencidos según el plan. La factura electrónica se emite conforme a la normatividad de la DIAN. El Usuario autoriza el envío de facturas y notas crédito al correo registrado.

Mora: la falta de pago dentro del plazo pactado generará intereses moratorios a la tasa máxima legal permitida y podrá derivar, previo aviso al correo registrado con al menos cinco (5) días calendario de anticipación, en la suspensión del servicio. La suspensión por mora no exime al Usuario de las obligaciones acumuladas. Si la mora supera sesenta (60) días calendario, ${RAZON_SOCIAL} podrá dar por terminado el contrato.

Disputas de facturación: deben reportarse a ${EMAIL} dentro de los treinta (30) días calendario siguientes a la emisión de la factura, con la documentación de soporte. Vencido este plazo, la factura se entenderá aceptada para todos los efectos.`,
      },
      {
        heading: '7. Propiedad intelectual',
        body: `Todos los derechos de propiedad intelectual e industrial sobre la Plataforma —incluyendo, sin limitarse a, el software, código fuente y objeto, arquitectura, bases de datos, interfaces, diseños, marcas, nombres comerciales, logos, manuales, materiales de capacitación y documentación— son y seguirán siendo de propiedad exclusiva de ${RAZON_SOCIAL} o de sus licenciantes, y se encuentran protegidos por la Decisión 486 de 2000 de la Comunidad Andina, la Ley 23 de 1982, la Ley 44 de 1993 y demás normas aplicables sobre derechos de autor, propiedad industrial y secretos empresariales.

Estos Términos otorgan al Usuario una licencia limitada, no exclusiva, no transferible, revocable y restringida al territorio colombiano para usar la Plataforma exclusivamente conforme a su finalidad y durante la vigencia del servicio contratado. Cualquier uso por fuera de estos límites requerirá autorización escrita previa.

Datos del Usuario. Los datos cargados por el Usuario (información de Aportantes, Cotizantes, novedades, soportes, etc.) son de propiedad exclusiva del Usuario o de sus titulares, según corresponda. ${RAZON_SOCIAL} actúa como Encargado o Responsable del tratamiento, según el caso, y solo los usa para prestar el servicio y cumplir obligaciones legales, en los términos de la Política de privacidad. El Usuario otorga a ${RAZON_SOCIAL} una licencia limitada para procesar los datos con esta finalidad.

Retroalimentación. Las sugerencias, comentarios o ideas que el Usuario remita al Prestador para mejorar el servicio podrán ser usadas libremente por ${RAZON_SOCIAL} sin generar contraprestación.`,
      },
      {
        heading: '8. Confidencialidad mutua',
        body: `Cada parte se obliga a mantener bajo estricta reserva la información confidencial de la otra a la que tenga acceso con ocasión de la relación, incluyendo información comercial, financiera, técnica, operativa, datos personales y datos de Cotizantes. La obligación de confidencialidad subsistirá durante la vigencia del contrato y por cinco (5) años adicionales contados desde su terminación, sin perjuicio de los plazos mayores que aplican a los datos personales y a la información de seguridad social.

No se considerará confidencial la información que: (i) sea o llegue a ser de dominio público sin culpa de la parte receptora; (ii) ya estuviera en posesión legítima de la parte receptora antes de la divulgación; (iii) deba revelarse por mandato legal, judicial o administrativo, en cuyo caso la parte receptora notificará a la otra cuando ello sea legalmente posible.`,
      },
      {
        heading: '9. Disponibilidad del servicio (SLA) y mantenimiento',
        body: `${RAZON_SOCIAL} se compromete a desplegar esfuerzos comerciales razonables (best-effort) para mantener la Plataforma disponible las 24 horas del día, los 7 días de la semana, con una meta interna de disponibilidad del 99% mensual, excluidas las ventanas de mantenimiento.

Ventanas de mantenimiento programado: típicamente domingos entre las 00:00 y las 04:00 (hora de Colombia). Estas ventanas se anunciarán con al menos cuarenta y ocho (48) horas de anticipación cuando sean preventivas. El mantenimiento correctivo de emergencia podrá ejecutarse sin preaviso para mitigar incidentes críticos.

Exclusiones del SLA. NO computan como indisponibilidad: (i) interrupciones por mantenimiento programado; (ii) fallas atribuibles a Operadores Autorizados, Entidades del SGSS, pasarelas de pago, proveedores de internet, infraestructura cloud o cualquier tercero ajeno al control directo del Prestador; (iii) eventos de fuerza mayor o caso fortuito; (iv) ataques de denegación de servicio o conducta dolosa de terceros; (v) uso indebido de la Plataforma por parte del Usuario.

${RAZON_SOCIAL} NO garantiza disponibilidad del 100%, ausencia total de errores ni que la Plataforma satisfaga necesidades específicas no documentadas. Los planes empresariales podrán incluir SLA reforzados con créditos en servicio, en los términos del documento comercial respectivo.`,
      },
      {
        heading: '10. Limitación de responsabilidad',
        body: `En la máxima medida permitida por la ley colombiana:

(a) ${RAZON_SOCIAL} responderá únicamente por daños directos y previsibles que se deriven de su dolo o culpa grave en la prestación del servicio.

(b) ${RAZON_SOCIAL} NO será responsable por: (i) daños indirectos, consecuenciales, lucro cesante, daño emergente futuro, pérdida de oportunidad, pérdida de información o de imagen comercial; (ii) decisiones, errores, demoras o incumplimientos imputables a Operadores Autorizados, Entidades del SGSS, pasarelas de pagos, entidades financieras o cualquier tercero; (iii) caso fortuito, fuerza mayor, hecho de un tercero, conmoción interior, actos de autoridad, falla de telecomunicaciones, ciberataques, pandemias y cualquier circunstancia ajena a su control razonable; (iv) daños derivados del uso indebido de la Plataforma por parte del Usuario, de la inexactitud de los datos suministrados o del incumplimiento de las obligaciones a su cargo; (v) sanciones impuestas al Usuario por autoridades públicas cuando se originen en hechos atribuibles al propio Usuario.

(c) En ningún caso la responsabilidad acumulada de ${RAZON_SOCIAL} frente al Usuario por todas las reclamaciones surgidas durante un período de doce (12) meses excederá el valor total efectivamente pagado por el Usuario al Prestador en los doce (12) meses inmediatamente anteriores al hecho generador.

(d) Las limitaciones anteriores no aplican a la responsabilidad que, conforme a normas imperativas (incluyendo el Estatuto del Consumidor para Usuarios B2C y la normatividad sobre protección de datos personales), no pueda ser limitada o excluida.`,
      },
      {
        heading: '11. Indemnidad cruzada',
        body: `El Usuario se obliga a mantener indemne a ${RAZON_SOCIAL}, a sus accionistas, administradores, empleados y aliados frente a cualquier reclamo, demanda, sanción, multa o gasto (incluidos honorarios de abogado razonables) que se derive de: (i) información falsa, inexacta o incompleta suministrada por el Usuario; (ii) incumplimiento del Usuario a la normatividad tributaria, laboral, comercial o de seguridad social; (iii) infracción a derechos de terceros (propiedad intelectual, datos personales, honra, etc.); (iv) uso indebido o ilegal de la Plataforma.

Recíprocamente, ${RAZON_SOCIAL} mantendrá indemne al Usuario frente a reclamos de terceros que aleguen que el uso correcto de la Plataforma —dentro de los límites de estos Términos— infringe derechos de propiedad intelectual de un tercero, sujeto a las limitaciones de responsabilidad del numeral 10.`,
      },
      {
        heading: '12. Modificaciones del servicio y de los Términos',
        body: `${RAZON_SOCIAL} podrá modificar la Plataforma, sus funcionalidades, planes y estos Términos en cualquier momento. Cuando los cambios afecten obligaciones esenciales (precio, finalidad, alcance, derechos y obligaciones materiales), se notificarán al correo registrado y/o mediante aviso destacado en la Plataforma con al menos quince (15) días calendario de anticipación a su entrada en vigor.

Si el Usuario no está de acuerdo con los cambios, podrá terminar el contrato sin penalización antes de la fecha de entrada en vigor, conservando el derecho a la portabilidad de sus datos. El uso continuado de la Plataforma después de la fecha de entrada en vigor implica aceptación de los nuevos Términos.`,
      },
      {
        heading: '13. Terminación, devolución y portabilidad de datos',
        body: `Terminación voluntaria por el Usuario. El Usuario podrá terminar el contrato en cualquier momento mediante aviso a ${EMAIL} con al menos treinta (30) días calendario de anticipación, sin perjuicio de las obligaciones causadas hasta la fecha de terminación.

Terminación por ${RAZON_SOCIAL}. ${RAZON_SOCIAL} podrá terminar el contrato: (i) por incumplimiento grave o reiterado de estos Términos por parte del Usuario, previo requerimiento cuando proceda; (ii) por mora superior a sesenta (60) días calendario; (iii) por inactividad superior a doce (12) meses con notificación previa de treinta (30) días calendario; (iv) por mandato legal o judicial; (v) cuando deje de prestar el servicio, con preaviso de noventa (90) días calendario.

Efectos de la terminación. Tras la terminación, ${RAZON_SOCIAL}: (i) inhabilitará el acceso del Usuario; (ii) pondrá a su disposición, durante un plazo no inferior a treinta (30) días calendario, una exportación en formato estructurado y de uso común (CSV, Excel u otro razonable) de los datos del Usuario; (iii) cumplido ese plazo, procederá al borrado o anonimización segura de los datos, salvo aquellos que deba conservar por mandato legal (contables, tributarios, laborales, de seguridad social) o para defenderse de reclamos. Los soportes ya entregados a operadores y entidades del SGSS no podrán retirarse del SGSS.`,
      },
      {
        heading: '14. Disposiciones para Usuarios Independientes (B2C) — Estatuto del Consumidor',
        body: `Cuando el Usuario actúe como consumidor en los términos del artículo 5 de la Ley 1480 de 2011 (Estatuto del Consumidor), aplicarán adicionalmente las siguientes garantías legales irrenunciables:

(a) Información clara y suficiente. El Prestador garantiza información transparente sobre tarifas, ciclo de cobro, condiciones de prestación y mecanismos de cancelación, conforme al artículo 23 y siguientes del Estatuto.

(b) Derecho de retracto (artículo 47). En las contrataciones celebradas a distancia (incluyendo contrataciones por medios electrónicos), el consumidor podrá ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a la celebración del contrato, devolviendo lo recibido en buen estado y siempre que no se haya iniciado total o significativamente la prestación del servicio. Para ejercerlo, basta enviar comunicación a ${EMAIL} indicando la voluntad de retractarse. El reembolso se realizará dentro de los treinta (30) días calendario siguientes, conforme al artículo 47.

(c) Reversión del pago (artículo 51). El consumidor podrá solicitar la reversión del pago electrónico cuando se presente una de las causales legales (transacción no autorizada, producto no recibido o no corresponde a lo solicitado, etc.).

(d) Garantía legal y derecho a presentar PQRs. El consumidor podrá presentar peticiones, quejas y reclamos a ${EMAIL}, los cuales serán atendidos en los plazos del Estatuto. En caso de no resolverse satisfactoriamente, podrá acudir a la Superintendencia de Industria y Comercio.

Estas garantías son de orden público y no podrán renunciarse anticipadamente. Cualquier estipulación en contrario se entenderá no escrita.`,
      },
      {
        heading: '15. Resolución de controversias',
        body: `Las partes harán esfuerzos de buena fe para resolver directamente cualquier controversia derivada de estos Términos. Si transcurridos treinta (30) días calendario desde la notificación escrita de la controversia no se logra acuerdo, las partes podrán acudir a un mecanismo alternativo de solución de conflictos —conciliación o, cuando se acuerde, arbitraje— ante un centro de conciliación o arbitraje autorizado en ${CIUDAD}.

En caso de no someterse a arbitraje, la controversia será resuelta por los jueces ordinarios competentes de ${CIUDAD}. Lo anterior se entiende sin perjuicio de las acciones que conforme al Estatuto del Consumidor pueda interponer el Usuario B2C ante la Superintendencia de Industria y Comercio.`,
      },
      {
        heading: '16. Ley aplicable, jurisdicción, notificaciones y disposiciones finales',
        body: `Ley aplicable y jurisdicción. Estos Términos se rigen por las leyes de la República de Colombia. La jurisdicción competente es la de la ciudad de ${CIUDAD}, salvo norma imperativa en contrario.

Notificaciones. Las comunicaciones formales al Prestador deberán dirigirse al correo ${EMAIL} y/o a ${DIRECCION_FISICA}, ${CIUDAD}. Las notificaciones al Usuario se entenderán válidamente realizadas al correo registrado en su Cuenta.

Cesión. El Usuario no podrá ceder sus derechos u obligaciones bajo estos Términos sin autorización escrita previa. ${RAZON_SOCIAL} podrá ceder el contrato en el marco de procesos de reorganización empresarial, dando aviso al Usuario.

Independencia de cláusulas. Si una disposición de estos Términos se declara inválida, ineficaz o inaplicable, las demás conservarán plena vigencia.

Encabezados. Los títulos son meramente referenciales y no afectan la interpretación.

Acuerdo íntegro. Estos Términos, junto con la Política de privacidad, la Autorización de tratamiento de datos personales y los documentos comerciales suscritos, constituyen el acuerdo íntegro entre las partes y prevalecen sobre cualquier comunicación o entendimiento previo.`,
      },
      {
        heading: '17. Contacto',
        body: `${RAZON_SOCIAL}
NIT: ${NIT}
Matrícula mercantil: ${MATRICULA}
Domicilio: ${DIRECCION_FISICA}, ${CIUDAD}
Correo electrónico: ${EMAIL}
Sitio web: ${WEBSITE_URL}`,
      },
    ],
  },

  privacidad: {
    title: 'Política de tratamiento de datos personales',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Identificación del Responsable del Tratamiento',
        body: `Razón social: ${RAZON_SOCIAL}.
NIT: ${NIT}.
Matrícula mercantil: ${MATRICULA} (Cámara de Comercio de Pereira).
Domicilio: ${DIRECCION_FISICA}, ${CIUDAD}.
Correo electrónico para protección de datos: ${EMAIL}.
Sitio web: ${WEBSITE_URL}.

${RAZON_SOCIAL} (en adelante, el "Responsable") actúa como Responsable del Tratamiento de los datos personales recolectados a través de la plataforma ${NOMBRE_PLATAFORMA} (la "Plataforma"). Cuando el cliente sea una empresa que carga datos de sus propios cotizantes, ${RAZON_SOCIAL} podrá actuar como Encargado del Tratamiento, en cuyo caso se suscribirán los acuerdos de transmisión correspondientes.`,
      },
      {
        heading: '2. Marco normativo aplicable',
        body: `Esta Política de tratamiento de datos personales (la "Política") se expide conforme a:

• Constitución Política de Colombia, artículo 15 (derecho a la intimidad y al habeas data).
• Ley 1581 de 2012 — Régimen general de protección de datos personales.
• Decreto 1377 de 2013 — Reglamentación parcial de la Ley 1581 de 2012.
• Decreto 1074 de 2015 — Decreto Único Reglamentario del Sector Comercio, Industria y Turismo (Libro 2, Parte 2, Título 2, Capítulo 25).
• Ley 1266 de 2008 — Habeas data financiero, crediticio y comercial (cuando aplique).
• Ley 1480 de 2011 — Estatuto del Consumidor.
• Ley 527 de 1999 — Comercio electrónico.
• Resolución 2388 de 2016 del Ministerio de Salud y Protección Social — PILA.
• Decreto 1273 de 2018 — Pago mes vencido de aportes de independientes.
• Circulares y conceptos de la Superintendencia de Industria y Comercio (SIC).`,
      },
      {
        heading: '3. Definiciones',
        body: `Se adoptan las definiciones del artículo 3 de la Ley 1581 de 2012 y del artículo 3 del Decreto 1377 de 2013, en particular: Autorización, Aviso de privacidad, Base de datos, Dato personal, Dato público, Dato semiprivado, Dato privado, Dato sensible, Encargado del Tratamiento, Responsable del Tratamiento, Titular, Tratamiento y Transmisión.`,
      },
      {
        heading: '4. Categorías de datos personales tratados',
        body: `${RAZON_SOCIAL} trata las siguientes categorías de datos personales, recolectados directamente del Titular o por intermedio del Aportante:

(a) Datos de identificación: tipo y número de documento, nombres y apellidos, firma, fotografía cuando se cargue.

(b) Datos de contacto: correo electrónico, teléfono fijo o móvil, dirección de residencia o de notificaciones.

(c) Datos socio-demográficos: fecha y lugar de nacimiento, género, nacionalidad, estado civil, nivel educativo, composición familiar cuando sea necesario para beneficios de CCF.

(d) Datos laborales y de seguridad social: cargo, salario o ingreso base de cotización (IBC), modalidad de afiliación, fechas de ingreso/retiro, novedades, EPS, AFP, ARL, CCF, número de afiliación.

(e) Datos financieros y de pago: información bancaria para débitos o consignaciones, datos de facturación, historial de pagos. NO almacenamos PAN completo ni CVV de tarjetas; los pagos con tarjeta se procesan a través de pasarelas certificadas PCI-DSS.

(f) DATOS SENSIBLES (artículo 5 Ley 1581 de 2012): información médica y de salud asociada a incapacidades, licencias de maternidad/paternidad, calificaciones de origen y pérdida de capacidad laboral, soportes médicos cargados al expediente de incapacidades, certificados de discapacidad. Adicionalmente, datos asociados al flujo jurídico (peticiones, tutelas, desacatos, resoluciones) cuando contengan información sensible.

(g) Datos técnicos y de uso: dirección IP, identificadores de dispositivo, navegador, sistema operativo, logs de actividad, bitácora completa de operaciones críticas, cookies estrictamente necesarias y, previa autorización, cookies analíticas.

(h) Datos de menores de edad: solo cuando sean indispensables para la afiliación a salud (beneficiarios) o para el reconocimiento de prestaciones, con autorización del representante legal.`,
      },
      {
        heading: '5. Finalidades del tratamiento',
        body: `Los datos personales se tratan para las siguientes finalidades, agrupadas por categoría:

A. Operación del servicio (necesarias para ejecutar el contrato):
(i) Crear y administrar la cuenta del Usuario.
(ii) Liquidar, validar, generar, presentar y pagar la PILA conforme a la Resolución 2388 de 2016, a través del Operador Autorizado aliado.
(iii) Tramitar afiliaciones, novedades y consultas ante Entidades del SGSS.
(iv) Radicar y hacer seguimiento de incapacidades y licencias.
(v) Gestionar cartera, recaudo y conciliación.
(vi) Brindar soporte técnico y operativo.

B. Cumplimiento de obligaciones legales:
(vii) Cumplir obligaciones tributarias, contables, comerciales, laborales y de seguridad social.
(viii) Atender requerimientos de autoridades judiciales y administrativas.
(ix) Conservar registros para fines probatorios y de auditoría.

C. Gestión comercial y mejora del servicio:
(x) Facturación electrónica y cobranza.
(xi) Atender PQRs, comunicaciones operativas y notificaciones.
(xii) Realizar análisis estadísticos, métricas internas y mejorar la calidad del servicio.

D. Finalidades facultativas (requieren autorización adicional y son revocables):
(xiii) Envío de comunicaciones comerciales, promocionales o de marketing sobre productos y servicios propios o de aliados.
(xiv) Estudios de mercado y encuestas de satisfacción.
(xv) Personalización de contenidos y publicidad.

E. Tratamiento de datos sensibles (facultativo, ver numeral 7):
(xvi) Operar el módulo de incapacidades, gestionar soportes médicos y comunicarse con EPS/ARL para el reconocimiento y pago de prestaciones económicas.
(xvii) Apoyar trámites jurídicos asociados a la seguridad social.

El Titular puede negarse al tratamiento para finalidades facultativas sin que ello afecte la prestación de los servicios principales.`,
      },
      {
        heading: '6. Bases legales del tratamiento',
        body: `El tratamiento se realiza, según corresponda, con fundamento en:

(a) Consentimiento previo, expreso e informado del Titular (artículos 9 y 10 Ley 1581 de 2012), recolectado mediante mecanismos verificables (casillas de aceptación, formularios, firma electrónica o aceptación expresa al usar la Plataforma).

(b) Ejecución de un contrato del cual el Titular es parte o gestiones precontractuales realizadas a su solicitud.

(c) Cumplimiento de una obligación legal a cargo del Responsable (deberes tributarios, contables, laborales, del SGSS).

(d) Interés legítimo del Responsable, ponderado frente a los derechos y libertades del Titular, exclusivamente para fines como prevención del fraude, seguridad de la información y mejora del servicio (no aplica a datos sensibles).

(e) Salvaguarda del interés vital del Titular o de un tercero, en situaciones de urgencia médica documentada.

(f) Excepciones legales en que la autorización no es necesaria conforme al artículo 10 de la Ley 1581 de 2012 (información requerida por entidad pública en ejercicio de funciones legales, datos de naturaleza pública, urgencia médica o sanitaria, estudios estadísticos previa anonimización, casos relacionados con el Registro Civil).`,
      },
      {
        heading: '7. Tratamiento de datos sensibles',
        body: `De conformidad con el artículo 6 de la Ley 1581 de 2012, el tratamiento de datos sensibles está prohibido salvo en los casos que la ley permite. ${RAZON_SOCIAL} solo trata datos sensibles cuando: (i) cuenta con autorización previa, expresa e informada del Titular, salvo causa legal que exima de tal requisito; (ii) el tratamiento es necesario para la operación del módulo de incapacidades o el flujo jurídico; o (iii) se trata de información necesaria para salvaguardar el interés vital del Titular.

Carácter facultativo. La autorización para tratar datos sensibles ES FACULTATIVA. El Titular tiene derecho a no responder preguntas sobre datos sensibles y la negativa no condiciona la prestación de los servicios básicos. Sin embargo, el rechazo a tratar datos sensibles asociados a una incapacidad o a un trámite jurídico podrá impedir, por su propia naturaleza, la operación del módulo respectivo.

Medidas reforzadas. Los datos sensibles están sujetos a controles de acceso granulares, cifrado adicional, registros de auditoría detallados y restricciones de visualización. El acceso se limita al personal estrictamente necesario, bajo deber de confidencialidad reforzado.`,
      },
      {
        heading: '8. Tratamiento de datos de menores de edad',
        body: `${RAZON_SOCIAL} solo trata datos personales de menores de edad cuando ello sea necesario para finalidades vinculadas a la afiliación al SGSS (por ejemplo, beneficiarios en salud) o al reconocimiento de prestaciones. En estos casos:

(i) El tratamiento responde y respeta el interés superior del niño, niña y adolescente, conforme al artículo 12 del Decreto 1377 de 2013 y a la Sentencia T-260 de 2012 de la Corte Constitucional.

(ii) Se requiere la autorización del representante legal del menor (padre, madre o tutor), quien debe demostrar dicha calidad.

(iii) Se respetan los derechos prevalentes del niño, niña y adolescente y se observa el principio de finalidad.

(iv) ${RAZON_SOCIAL} se abstiene de utilizar datos de menores para fines comerciales, de marketing o de generación de perfiles.`,
      },
      {
        heading: '9. Encargados del tratamiento y transferencias internacionales',
        body: `Para prestar el servicio, ${RAZON_SOCIAL} comparte datos personales con terceros, en su rol de Encargados o como destinatarios autorizados:

(a) Operador Autorizado de PILA: para la presentación y pago de la planilla. La transmisión es indispensable para la operación del servicio y se realiza bajo los acuerdos suscritos.

(b) Entidades del SGSS (EPS, AFP, ARL, CCF, ICBF, SENA): destinatarias legales de la información reportada en PILA y novedades.

(c) Proveedores de infraestructura cloud, monitoreo y operación tecnológica:
   • Neon (base de datos PostgreSQL administrada) — servidores ubicados en Estados Unidos.
   • Sentry (monitoreo de errores) — Estados Unidos / Unión Europea según configuración.
   • Almacenamiento de copias de seguridad cifradas en Amazon S3 — región que aplique.

Transferencias internacionales. Estados Unidos NO está incluido en el listado de países con nivel adecuado de protección emitido por la SIC. En consecuencia, las transferencias internacionales se amparan en: (i) consentimiento expreso del Titular para esta transferencia; (ii) cláusulas contractuales suscritas con los Encargados internacionales que imponen estándares equivalentes a los exigidos por la Ley 1581 de 2012; (iii) cuando proceda, declaraciones de conformidad y mecanismos certificados de transferencia (SCCs y similares).

(d) Pasarelas de pago y entidades financieras: para el procesamiento de pagos.
(e) Asesores externos (jurídicos, contables, auditores) sometidos a deber de confidencialidad.
(f) Autoridades competentes cuando medie requerimiento legal o judicial.

${RAZON_SOCIAL} NO vende, NO alquila ni cede datos personales a terceros con fines comerciales no autorizados.`,
      },
      {
        heading: '10. Medidas de seguridad',
        body: `${RAZON_SOCIAL} adopta medidas técnicas, administrativas y físicas razonables y proporcionales al tipo y volumen de datos tratados, conforme al principio de seguridad del artículo 4 de la Ley 1581 de 2012:

Medidas técnicas:
• Cifrado en tránsito mediante TLS 1.2 o superior.
• Cifrado en reposo de credenciales y datos sensibles con AES-256-GCM.
• Autenticación con NextAuth y sesiones JWT con expiración corta (15 minutos) y rotación.
• Bitácora completa de operaciones críticas (auditoría de accesos, modificaciones y consultas a datos sensibles).
• Monitoreo continuo de errores y eventos de seguridad con Sentry.
• Copias de seguridad cifradas y replicadas a almacenamiento S3.
• Hardening de infraestructura, gestión de parches, separación de entornos (desarrollo, pruebas, producción).
• Política de contraseñas robustas y, cuando aplique, segundo factor de autenticación.

Medidas administrativas:
• Política de control de acceso por roles (RBAC) con permisos granulares.
• Acuerdos de confidencialidad con empleados, contratistas y aliados.
• Capacitación periódica al personal en protección de datos.
• Procedimientos formales de gestión de incidentes.
• Designación de responsable interno de protección de datos.

Medidas físicas:
• Centros de datos de los proveedores cloud con certificaciones internacionales (SOC 2, ISO 27001 o equivalentes) y controles físicos de acceso.

Ningún sistema es absolutamente invulnerable. ${RAZON_SOCIAL} no garantiza la imposibilidad absoluta de incidentes, pero se obliga a mantener un nivel de seguridad razonable y a actuar con diligencia ante cualquier evento.`,
      },
      {
        heading: '11. Tiempo de conservación',
        body: `Los datos personales se conservan únicamente por el tiempo razonable y necesario para cumplir las finalidades del tratamiento y las obligaciones legales aplicables, conforme a los siguientes criterios:

(a) Datos contables, tributarios y de facturación: diez (10) años, conforme al artículo 28 de la Ley 962 de 2005 y al artículo 60 del Código de Comercio.

(b) Información laboral y de seguridad social: hasta treinta (30) años conforme a la prescripción de las acciones laborales y a las obligaciones de conservación del SGSS, sin perjuicio de plazos mayores cuando aplique.

(c) Soportes adjuntos a incapacidades (archivos médicos): se mantienen en disco activo por un máximo de ciento veinte (120) días contados desde su cargue; vencido este plazo, los archivos físicos se eliminan de manera segura, conservándose únicamente el registro estructurado de la incapacidad como evidencia.

(d) Logs y bitácora de auditoría: hasta cinco (5) años o el plazo legal aplicable, lo que sea mayor.

(e) Datos de marketing y finalidades facultativas: hasta que el Titular revoque la autorización o ejerza derecho de supresión.

(f) Cuentas inactivas: tras doce (12) meses de inactividad, previa notificación, se procede al cierre y a la conservación únicamente de la información que la ley exija mantener.

Vencidos los plazos de conservación y agotadas las finalidades, los datos se eliminan de forma segura o se anonimizan irreversiblemente.`,
      },
      {
        heading: '12. Derechos del Titular',
        body: `El Titular tiene los siguientes derechos consagrados en el artículo 8 de la Ley 1581 de 2012 y el artículo 21 del Decreto 1377 de 2013:

(a) Conocer, actualizar y rectificar sus datos personales.
(b) Solicitar prueba de la autorización otorgada, salvo cuando expresamente se exceptúe.
(c) Ser informado, previa solicitud, sobre el uso que se ha dado a sus datos.
(d) Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la Ley 1581 de 2012.
(e) Revocar la autorización y/o solicitar la supresión del dato cuando el tratamiento no respete principios, derechos y garantías constitucionales y legales, salvo deber legal o contractual de permanencia.
(f) Acceder en forma gratuita a sus datos personales que hayan sido objeto de tratamiento.

Plazos legales de respuesta:
• Consultas: máximo diez (10) días hábiles desde su recepción, prorrogables hasta por cinco (5) días hábiles más, comunicando los motivos al Titular.
• Reclamos: máximo quince (15) días hábiles desde el día siguiente a su recepción, prorrogables hasta por ocho (8) días hábiles más.

Si no se cumplen los plazos, el Titular podrá acudir a la SIC.`,
      },
      {
        heading: '13. Procedimiento para el ejercicio de derechos',
        body: `Para ejercer cualquiera de los derechos consagrados en la Ley 1581 de 2012, el Titular o sus causahabientes podrán presentar consulta o reclamo a través de:

Canal principal: correo electrónico ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.

La solicitud debe contener:
(i) Nombres y apellidos completos e identificación del Titular.
(ii) Calidad en la que actúa (titular, representante legal, causahabiente, apoderado).
(iii) Descripción clara y precisa de los hechos y del derecho que pretende ejercer (acceso, actualización, rectificación, supresión, revocación, prueba de autorización).
(iv) Datos de contacto para respuesta (correo y/o dirección).
(v) Documentos que sustenten la solicitud cuando aplique (copia del documento de identidad, poder, registro civil, etc.).

Trámite. Si la solicitud está incompleta, ${RAZON_SOCIAL} requerirá al Titular dentro de los cinco (5) días hábiles siguientes a la recepción para que subsane las fallas. Transcurridos dos (2) meses sin que se aporte la información, se entenderá desistida la reclamación.

Si quien recibe el reclamo no es competente para resolverlo, ${RAZON_SOCIAL} dará traslado a quien corresponda en un plazo máximo de dos (2) días hábiles e informará al Titular.`,
      },
      {
        heading: '14. Cookies y tecnologías similares',
        body: `La Plataforma utiliza cookies y tecnologías similares con los siguientes alcances:

(a) Cookies estrictamente necesarias: indispensables para el funcionamiento del servicio (autenticación, sesión, balanceo de carga, prevención de fraude). NO requieren consentimiento adicional, pues sin ellas la Plataforma no opera.

(b) Cookies de preferencias: recuerdan la configuración del Usuario (idioma, tema). Se activan tras aceptación.

(c) Cookies analíticas: permiten medir uso, tráfico y desempeño del servicio. Se activan únicamente con consentimiento del Usuario mediante el banner de cookies. Pueden incluir herramientas como Google Analytics u otras similares con configuración orientada a la privacidad (anonimización de IP).

(d) Cookies de marketing/publicidad: SOLO se activan tras consentimiento expreso y pueden ser desactivadas en cualquier momento.

El Usuario puede gestionar las cookies a través del banner de consentimiento de la Plataforma o de la configuración de su navegador. La desactivación de cookies no estrictamente necesarias no afecta el acceso al servicio, aunque puede limitar funcionalidades.`,
      },
      {
        heading: '15. Incidentes de seguridad y notificación',
        body: `${RAZON_SOCIAL} cuenta con un procedimiento formal de gestión de incidentes de seguridad. En caso de violación de los códigos de seguridad o de presentarse riesgos en la administración de la información de los Titulares, el Responsable:

(i) Activará el plan de respuesta a incidentes para contener, mitigar y remediar el evento.
(ii) Documentará el incidente, su impacto y las medidas adoptadas.
(iii) Reportará el incidente a la Superintendencia de Industria y Comercio dentro de los quince (15) días hábiles siguientes al momento en que se detecte la novedad, conforme a la Circular Externa 02 de 2018 y normas concordantes.
(iv) Notificará a los Titulares afectados, de manera oportuna y comprensible, cuando exista riesgo material para sus derechos.`,
      },
      {
        heading: '16. Contacto del responsable de protección de datos',
        body: `${RAZON_SOCIAL} ha designado un área responsable de la atención a peticiones, consultas y reclamos de los Titulares y del cumplimiento de la Ley 1581 de 2012:

Área responsable de protección de datos personales.
Correo electrónico: ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.
Horario de atención: lunes a viernes, 8:00 a.m. a 5:00 p.m. (hora de Colombia), salvo festivos.

Autoridad de control. La autoridad competente para conocer reclamos por infracciones a la normatividad de protección de datos personales en Colombia es la Superintendencia de Industria y Comercio (SIC) — www.sic.gov.co.`,
      },
      {
        heading: '17. Vigencia y modificaciones',
        body: `Esta Política rige a partir de su publicación en la Plataforma y mantendrá vigencia mientras no sea modificada por ${RAZON_SOCIAL}. Las bases de datos administradas tendrán vigencia indefinida mientras subsistan las finalidades del tratamiento o las obligaciones legales del Responsable.

Cualquier modificación sustancial será comunicada al Titular mediante aviso destacado en la Plataforma o al correo registrado, con al menos quince (15) días calendario de anticipación a su entrada en vigor. Cuando el cambio implique una nueva finalidad o un cambio sustancial en las condiciones del tratamiento, se solicitará nueva autorización.

Fecha de última actualización: ${FECHA_VIGENCIA}.`,
      },
    ],
  },

  'habeas-data': {
    title: 'Autorización de tratamiento de datos personales (Habeas Data)',
    subtitle: `${RAZON_SOCIAL} · Ley 1581 de 2012 — Decreto 1377 de 2013`,
    sections: [
      {
        heading: '1. Identificación del Responsable',
        body: `${RAZON_SOCIAL}, sociedad por acciones simplificada, identificada con NIT ${NIT}, inscrita en la Cámara de Comercio de Pereira bajo la matrícula mercantil ${MATRICULA}, con domicilio en ${DIRECCION_FISICA}, ${CIUDAD}, correo electrónico ${EMAIL} y sitio web ${WEBSITE_URL} (en adelante, el "Responsable"), actúa como Responsable del Tratamiento de los datos personales recolectados a través de la plataforma ${NOMBRE_PLATAFORMA}.`,
      },
      {
        heading: '2. Manifestación de autorización',
        body: `Yo, en mi calidad de Titular del dato personal o de representante legal del Titular cuando corresponda, declaro que de manera PREVIA, EXPRESA, LIBRE, VOLUNTARIA, INFORMADA E INEQUÍVOCA, autorizo a ${RAZON_SOCIAL} para recolectar, almacenar, consultar, usar, circular, transmitir, transferir, procesar, actualizar, rectificar, suprimir y, en general, dar Tratamiento a los datos personales que he suministrado o suministre en el futuro a través de la Plataforma, sus formularios, canales de atención y cualquier otro medio habilitado, conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013, el Decreto 1074 de 2015 y la Política de tratamiento de datos personales del Responsable, la cual declaro haber leído y comprendido íntegramente.

Esta autorización podrá manifestarse mediante:
(a) Casilla expresa de aceptación al momento del registro o de la firma electrónica de un documento.
(b) Aceptación verbal documentada cuando se diligencien formularios asistidos.
(c) Conductas inequívocas que permitan concluir razonablemente el consentimiento (por ejemplo, completar un formulario habiendo sido informado del aviso de privacidad).

Cuando aplique, este formato podrá presentarse con casillas separables que permitan al Titular autorizar o rechazar de manera independiente: (a) las finalidades necesarias para la prestación del servicio, (b) el tratamiento de datos sensibles, y (c) las finalidades comerciales y de marketing.`,
      },
      {
        heading: '3. Finalidades específicas autorizadas',
        body: `Autorizo el tratamiento de mis datos personales para las siguientes finalidades:

A. Necesarias para la prestación del servicio:
(i) Crear y administrar mi cuenta en la Plataforma.
(ii) Liquidar, validar, generar, presentar y pagar la Planilla Integrada de Liquidación de Aportes (PILA), conforme a la Resolución 2388 de 2016, a través del Operador Autorizado aliado.
(iii) Tramitar afiliaciones, novedades y consultas ante Entidades del SGSS (EPS, AFP, ARL, CCF, ICBF, SENA).
(iv) Radicar y hacer seguimiento de incapacidades, licencias y demás prestaciones económicas.
(v) Gestionar cartera, cobranza, recaudo y conciliación.
(vi) Apoyar trámites jurídicos asociados (peticiones, tutelas, desacatos, resoluciones) cuando el servicio lo contemple.
(vii) Atender PQRs y comunicaciones operativas.

B. Cumplimiento de obligaciones legales:
(viii) Cumplir obligaciones tributarias, contables, comerciales, laborales, mercantiles y de seguridad social.
(ix) Conservar la información para fines probatorios, de auditoría y de control.
(x) Atender requerimientos de autoridades judiciales y administrativas competentes.

C. Transmisión a terceros estrictamente para los fines anteriores:
(xi) Operador Autorizado de PILA, Entidades del SGSS, asesores externos sometidos a confidencialidad, proveedores de infraestructura cloud (Neon en Estados Unidos, Sentry, Amazon S3) bajo cláusulas contractuales que garantizan estándares equivalentes a la Ley 1581 de 2012, pasarelas de pago y entidades financieras.

D. Finalidades FACULTATIVAS (autorización adicional, separable y revocable):
(xii) Envío de comunicaciones comerciales, promocionales o de marketing sobre productos y servicios propios o de aliados.
(xiii) Estudios de mercado, encuestas de satisfacción y mejora de la experiencia.
(xiv) Personalización de contenidos.

El Titular puede negarse a las finalidades facultativas (D) sin que ello afecte la prestación de los servicios principales (A, B y C).`,
      },
      {
        heading: '4. Tratamiento de datos sensibles — carácter facultativo',
        body: `Declaro haber sido informado de que, conforme al artículo 5 de la Ley 1581 de 2012, son datos sensibles aquellos que afectan la intimidad o cuyo uso indebido puede generar discriminación, en particular los relativos a la salud, los datos biométricos y la información médica.

En el contexto de ${NOMBRE_PLATAFORMA}, son datos sensibles, entre otros: información médica asociada a incapacidades, certificados médicos, soportes de licencia de maternidad/paternidad, calificaciones de origen y de pérdida de capacidad laboral, información de salud cargada en el flujo jurídico.

Tratamiento facultativo. AUTORIZO de manera expresa el tratamiento de mis datos sensibles para las finalidades descritas. Declaro que esta autorización ES FACULTATIVA Y NO ES REQUISITO PARA EL ACCESO A LOS SERVICIOS BÁSICOS, sin perjuicio de que la negativa pueda hacer técnicamente inviable la prestación de servicios cuyo objeto requiere esos datos (por ejemplo, gestión de incapacidades). Puedo revocar esta autorización en cualquier momento.

Garantías. ${RAZON_SOCIAL} aplicará medidas reforzadas de seguridad sobre estos datos (cifrado, control de acceso granular, registros de auditoría) y restringirá su acceso al personal estrictamente necesario, sometido a deber de confidencialidad reforzado.`,
      },
      {
        heading: '5. Tratamiento de datos de menores de edad',
        body: `Cuando esta autorización se diligencie respecto de un menor de edad (por ejemplo, beneficiarios en salud o cotizantes menores cuando aplique), declaro que actúo como representante legal del menor (padre, madre, tutor o curador), que cuento con facultad legal para otorgar la autorización en su nombre, y que el tratamiento se realizará respetando el interés superior del niño, niña o adolescente, conforme al artículo 12 del Decreto 1377 de 2013 y la Sentencia T-260 de 2012 de la Corte Constitucional.`,
      },
      {
        heading: '6. Derechos del Titular y procedimiento para ejercerlos',
        body: `Como Titular tengo derecho, conforme al artículo 8 de la Ley 1581 de 2012, a:

(a) Conocer, actualizar y rectificar mis datos personales.
(b) Solicitar prueba de la autorización otorgada.
(c) Ser informado del uso que se ha dado a mis datos.
(d) Presentar quejas ante la Superintendencia de Industria y Comercio.
(e) Revocar la autorización y/o solicitar la supresión cuando no se respeten principios, derechos y garantías constitucionales y legales.
(f) Acceder en forma gratuita a mis datos personales.

Procedimiento. Puedo ejercer estos derechos enviando comunicación escrita a:

Correo electrónico: ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.

La solicitud debe contener:
(i) Nombres, apellidos completos e identificación.
(ii) Calidad en la que actúo (titular, representante, causahabiente, apoderado).
(iii) Descripción clara del derecho que ejerzo y de los hechos.
(iv) Datos de contacto para respuesta.
(v) Documentos de soporte cuando apliquen.

Plazos legales:
• Consultas: respuesta en máximo diez (10) días hábiles, prorrogables por cinco (5) días hábiles más.
• Reclamos: respuesta en máximo quince (15) días hábiles, prorrogables por ocho (8) días hábiles más.

Si la respuesta no es satisfactoria, puedo acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co), autoridad de control en materia de protección de datos personales en Colombia.`,
      },
      {
        heading: '7. Vigencia y revocación de la autorización',
        body: `Esta autorización tendrá vigencia mientras subsistan las finalidades del tratamiento y/o las obligaciones legales o contractuales del Responsable. Una vez agotadas las finalidades y vencidos los plazos legales de conservación, los datos serán suprimidos o anonimizados de forma segura.

Revocación. Puedo revocar esta autorización, total o parcialmente, en cualquier momento, mediante comunicación a ${EMAIL} o por los demás canales habilitados para el ejercicio de derechos. La revocación se hará efectiva una vez verificada y procesada la solicitud, sin perjuicio de los plazos legales de conservación.

Efectos. La revocación no afecta la licitud del tratamiento realizado con anterioridad a la misma. La revocación de autorizaciones esenciales para la prestación del servicio podrá implicar la suspensión o terminación de los servicios cuando los datos sean indispensables para su operación. La revocación de autorizaciones facultativas (marketing) no afecta la prestación del servicio principal.`,
      },
      {
        heading: '8. Consecuencias de no autorizar',
        body: `(a) Datos indispensables. La negativa a autorizar el tratamiento de los datos necesarios para la prestación del servicio (datos de identificación, contacto, laborales y de seguridad social) impide la operación del servicio, puesto que sin ellos no es posible liquidar la PILA, gestionar afiliaciones ni operar los módulos de la Plataforma.

(b) Datos sensibles. La negativa a autorizar el tratamiento de datos sensibles no impide acceder a los servicios básicos, pero puede hacer técnicamente inviable la operación de módulos cuyo objeto requiere esos datos (gestión de incapacidades, soporte jurídico con información de salud).

(c) Datos para finalidades facultativas. La negativa a autorizar finalidades comerciales o de marketing NO afecta de ninguna manera la prestación del servicio. El Titular puede aceptar o rechazar estas finalidades de forma independiente, y puede cambiar su decisión en cualquier momento.`,
      },
      {
        heading: '9. Aceptación',
        body: `Al marcar la casilla de aceptación correspondiente, al diligenciar y enviar el formulario de registro, al firmar el documento físico o electrónico que incorpora esta autorización, o al continuar con el uso de la Plataforma habiendo sido informado del Aviso de privacidad y de la Política de tratamiento de datos personales, manifiesto mi consentimiento LIBRE, PREVIO, EXPRESO E INFORMADO en los términos de la Ley 1581 de 2012 y el Decreto 1377 de 2013, y declaro que la información suministrada es veraz, exacta y actualizada.

Conservaré derecho de acceso a esta autorización en cualquier momento, mediante solicitud al correo ${EMAIL}.`,
      },
      {
        heading: '10. Contacto',
        body: `${RAZON_SOCIAL}
NIT: ${NIT}
Domicilio: ${DIRECCION_FISICA}, ${CIUDAD}
Correo: ${EMAIL}
Sitio web: ${WEBSITE_URL}

Autoridad de control: Superintendencia de Industria y Comercio — www.sic.gov.co.`,
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
