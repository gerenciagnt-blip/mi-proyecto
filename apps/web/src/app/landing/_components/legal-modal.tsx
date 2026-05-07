'use client';

/**
 * Modales legales: Términos de uso, Política de privacidad, Habeas Data.
 *
 * Textos oficiales validados por el área jurídica y vigentes desde el
 * 5 de mayo de 2026 (Ley 1581 de 2012 + Decreto 1377 de 2013 + demás
 * normatividad colombiana de protección de datos personales).
 *
 * Datos canónicos del responsable
 * --------------------------------
 *   Razón social: Grupo de Negocios Temporales SAS
 *   NIT: 901647065-4
 *   Correo: protecciondedatos@gntemporales.com
 *   Horario: lunes a viernes, 8:00–12:00 y 14:00–18:00
 *   Domicilio: Calle 19 N° 6-60 Piso 2, Pereira, Risaralda
 *
 * Cualquier cambio en estos datos se debe hacer en las constantes que
 * siguen — los textos legales referencian las constantes, no copias
 * literales.
 */

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';

type LegalDoc = 'terminos' | 'privacidad' | 'habeas-data';

const RAZON_SOCIAL = 'Grupo de Negocios Temporales SAS';
const CIUDAD = 'Pereira, Risaralda';
/** Único correo oficial — protección de datos, derechos del titular, PQRS, soporte legal. */
const EMAIL = 'protecciondedatos@gntemporales.com';
const FECHA_VIGENCIA = '5 de mayo de 2026';
const NIT = '901647065-4';
const DIRECCION_FISICA = 'Calle 19 N° 6-60 Piso 2';
const NOMBRE_PLATAFORMA = 'Sistema PILA';
const HORARIO = 'lunes a viernes, 8:00 a.m. a 12:00 m. y de 2:00 p.m. a 6:00 p.m.';

const LEGAL_DOCS: Record<LegalDoc, { title: string; subtitle: string; sections: Section[] }> = {
  terminos: {
    title: 'Términos y condiciones de uso',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Identificación del prestador y aceptación',
        body: `Los presentes Términos y condiciones de uso (en adelante, los "Términos") regulan el acceso y la utilización de la plataforma ${NOMBRE_PLATAFORMA} (en adelante, la "Plataforma") y de los servicios complementarios prestados a través de la misma.

El prestador del servicio es ${RAZON_SOCIAL}, sociedad por acciones simplificada constituida bajo las leyes de la República de Colombia, identificada con NIT ${NIT}, inscrita en el Registro Mercantil de la Cámara de Comercio de Pereira, con domicilio principal en ${DIRECCION_FISICA}, ${CIUDAD}, y correo electrónico de contacto ${EMAIL} (en adelante, "${RAZON_SOCIAL}", "nosotros" o el "Prestador").

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
        heading: '9. Disponibilidad del servicio (SLA), soporte y mantenimiento',
        body: `Disponibilidad. ${RAZON_SOCIAL} se compromete a desplegar esfuerzos comerciales razonables (best-effort) para mantener la Plataforma disponible las 24 horas del día, los 7 días de la semana, con una meta interna de disponibilidad del 99% mensual, excluidas las ventanas de mantenimiento.

Soporte técnico. El Prestador atiende solicitudes de soporte en el siguiente horario (hora de Colombia):
  • Lunes a viernes: 8:00 a.m. a 6:00 p.m.
  • Sábados: 8:00 a.m. a 12:00 m.
  • Domingos y festivos: sin atención humana presencial; se recibirán solicitudes con respuesta al inicio del siguiente turno hábil.

Canales oficiales de soporte:
  • Correo electrónico: ${EMAIL}
  • Formulario de PQRS disponible en la Plataforma
  • WhatsApp / mensajería: el número se publica en la sección de contacto de la Plataforma

Tiempos máximos de respuesta (medidos en horas hábiles dentro del horario de soporte):
  • Solicitudes generales (consultas, configuración, capacitación): 1 día hábil
  • Incidentes que afectan la operación de un Usuario individual: 4 horas hábiles
  • Caída total de la Plataforma o incidentes que afectan a múltiples Usuarios: respuesta inmediata en horario de soporte; mejor esfuerzo fuera de horario para mitigar el impacto.

Estos tiempos son de respuesta inicial al ticket, no de resolución definitiva, la cual dependerá de la complejidad del caso y de la dependencia de terceros (Operadores Autorizados, Entidades del SGSS, pasarelas de pago, etc.).

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

(b) Derecho de retracto (artículo 47, Ley 1480 de 2011). Tratándose de contrataciones celebradas a distancia o por medios electrónicos, el consumidor podrá ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a la celebración del contrato, mediante comunicación dirigida a ${EMAIL} manifestando su voluntad de retractarse.

No obstante, conforme al numeral 4 del artículo 47 de la Ley 1480 de 2011, NO procede el derecho de retracto cuando se haya iniciado total o significativamente la prestación del servicio. Para efectos de los presentes Términos, se entenderá que la prestación del servicio se ha iniciado significativamente cuando el Usuario haya realizado cualquiera de las siguientes actividades en la Plataforma: (i) creación, importación o gestión de cotizantes o cuentas de cobro; (ii) emisión, procesamiento o transmisión de planillas PILA u otros archivos de aportes; (iii) generación, emisión o entrega de comprobantes; (iv) radicación de incapacidades o de soportes de afiliación; (v) integración o sincronización con Operadores Autorizados o pasarelas de pago. En tales casos, el cobro causado por el período en que se inició la prestación no es reembolsable.

Cuando el retracto sea procedente por no haberse iniciado la prestación del servicio, el reembolso del valor pagado se efectuará dentro de los treinta (30) días calendario siguientes a la solicitud, descontando los costos de pasarela de pago en que se hubiere incurrido y a través del mismo medio de pago original, salvo acuerdo en contrario.

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
Domicilio: ${DIRECCION_FISICA}, ${CIUDAD}
Correo electrónico: ${EMAIL}
Horario de atención: ${HORARIO}`,
      },
    ],
  },

  privacidad: {
    title: 'Política de tratamiento de datos personales',
    subtitle: `Vigencia: ${FECHA_VIGENCIA} · ${RAZON_SOCIAL}`,
    sections: [
      {
        heading: '1. Presentación',
        body: `La presente política se define de conformidad con la entrada en vigencia de la Ley Estatutaria 1581 de 2012, la cual tiene por objeto dictar las disposiciones generales para la protección de datos personales y desarrollar el derecho constitucional que tienen todas las personas de conocer, actualizar y rectificar la información que se haya recogido sobre ellos en bases de datos o archivos, así como el derecho a la información.

Teniendo en cuenta lo establecido en la normatividad colombiana, la empresa ${RAZON_SOCIAL}, y/o las entidades que pertenezcan o llegaren a pertenecer a su grupo empresarial, teniendo en cuenta su condición de responsable del tratamiento de datos y con el fin de brindar las garantías necesarias para salvaguardar la información de la comunidad, se permite presentar la política de tratamientos en materia de protección de datos personales, en aras de dar efectivo cumplimiento a dicha normatividad y en especial para la atención de consultas y reclamos acerca del tratamiento de datos de carácter personal que recoja y maneje.

En virtud de lo anterior, dentro del deber legal y corporativo de ${RAZON_SOCIAL}, de proteger el derecho a la privacidad de las personas, así como la facultad de conocer, actualizar o solicitar la información que sobre ellas se archive en bases de datos, ha diseñado la presente política en la cual se describe y explica el tratamiento de la información personal a la que tiene acceso a través de nuestro sitio web, correo electrónico, información física, mensajes de texto, mensaje de voz, App, llamadas telefónicas, medios físicos o electrónicos, actuales o que en el futuro se desarrollen como otras comunicaciones enviadas así como por intermedio de terceros que participan en nuestra relación comercial o legal con todos nuestros clientes, empleados, proveedores, aliados estratégicos y vinculados.

La presente se irá ajustando en la medida en que se vaya reglamentando la normatividad aplicable a la materia y entren en vigencia nuevas disposiciones.

Los términos y condiciones expresados a continuación, regulan el uso de este sitio web y los cuales se han puesto a su servicio. Cuando ingresa y usa nuestra Plataforma, adquiere de forma automática la calidad de "Usuario". En virtud de lo anterior, el Usuario entiende que el uso de la presente herramienta significa una aceptación de este Aviso Legal, así como de las condiciones generales de uso. En cualquier momento y sin obligación de notificarlo con anterioridad, ${RAZON_SOCIAL} puede editar, cambiar, renovar, agregar o retirar cualquier parte o la totalidad de los términos y condiciones de la Plataforma. Por eso es su responsabilidad como Usuario, verificar la información contenida en los términos y condiciones del sitio, siempre que vaya a hacer uso de alguno de sus contenidos o servicios.`,
      },
      {
        heading:
          '2. Identificación del responsable y/o encargado del tratamiento de datos personales',
        body: `Razón social: ${RAZON_SOCIAL}.
NIT: ${NIT}.
Correo electrónico: ${EMAIL}.
Horario de atención presencial: ${HORARIO}.
Domicilio principal y dirección de notificación judicial: ${DIRECCION_FISICA}, ${CIUDAD}.

En adelante, el "Responsable" actúa como Responsable del Tratamiento de los datos personales recolectados a través de la plataforma ${NOMBRE_PLATAFORMA} (la "Plataforma"). Cuando el cliente sea una empresa que carga datos de sus propios cotizantes, ${RAZON_SOCIAL} podrá actuar como Encargado del Tratamiento, en cuyo caso se suscribirán los acuerdos de transmisión correspondientes.`,
      },
      {
        heading: '3. Aviso legal',
        body: `El Usuario, al consentir en cualquiera de los contratos que se perfeccionan al realizar transacciones, declara bajo la gravedad de juramento, que sus ingresos provienen de actividades lícitas, que no se encuentra con registro negativo en listados de prevención de lavado de activos nacionales o internacionales, que no se encuentra dentro de una de las dos categorías de lavado de activos (conversión o movimiento) y que en consecuencia, se obliga a responder frente a ${RAZON_SOCIAL}, por todos los perjuicios que se llegaren a causar como consecuencia de esta afirmación, en igual sentido responderá ante terceros.

Declara igualmente, que sus conductas se ajustan a la Ley y a la ética y, en consecuencia, se obliga a implementar las medidas tendientes a evitar que sus operaciones puedan ser utilizadas con o sin su consentimiento y conocimiento como instrumentos para el ocultamiento, manejo, inversión o aprovechamiento en cualquier forma de dinero u otros bienes provenientes de actividades delictivas, o para dar apariencia de legalidad a estas actividades.

En el mismo sentido, se compromete a actuar dentro del marco legal vigente en Colombia, dando cumplimiento a todos los procedimientos, trámites y obligaciones contemplados en la Ley y demás normas pertinentes y que cualquier evidencia de que estos principios no se cumplen o puedan estar en entredicho será causal suficiente para resolver, a criterio de la Parte cumplida, el contrato que resulte de su aceptación.`,
      },
      {
        heading: '4. Marco normativo aplicable',
        body: `Esta Política de tratamiento de datos personales (la "Política") se expide conforme a:

• Constitución Política de Colombia.
• Ley 1581 de 2012.
• Decreto 1377 de 2013.
• Decreto 1074 de 2015.
• Ley 1266 de 2008.
• Ley 1480 de 2011.
• Ley 527 de 1999.
• Resolución 2388 de 2016.
• Decreto 1273 de 2018.
• Circulares y conceptos de la Superintendencia de Industria y Comercio (SIC).`,
      },
      {
        heading: '5. Definiciones',
        body: `A continuación, se relacionan las siguientes definiciones para una comprensión adecuada de la presente política:

• Autorización: consentimiento previo, expreso e informado del Titular del dato para llevar a cabo el Tratamiento. Esta puede ser (i) escrita; (ii) verbal o; (iii) conductas inequívocas que permitan concluir de forma razonable que el Titular aceptó el Tratamiento de sus datos.

• Base de Datos: conjunto organizado de Datos Personales que sean objeto de Tratamiento, electrónico o no, cualquiera que fuere la modalidad de su formación, almacenamiento, organización y acceso.

• Consulta: solicitud del Titular del Dato Personal, de las personas autorizadas por éste, o las autorizadas por ley, para conocer la información que reposa sobre él en las Bases de Datos de la EMPRESA.

• Dato Personal: cualquier información vinculada o que pueda asociarse a una o varias personas naturales, determinadas o determinables.

• Dato Personal Privado: dato que por su naturaleza íntima o reservada sólo es relevante para el Titular. Por ejemplo: los papeles o libros de los comerciantes y documentos privados.

• Dato Personal Público: dato calificado como tal, según los mandatos de la ley o de la Constitución Política y todos aquellos que no sean semiprivados, privados o sensibles. Por ejemplo: los datos contenidos en documentos públicos, registros públicos, gacetas y boletines oficiales y sentencias judiciales debidamente ejecutoriadas que no estén sometidos a reserva, los relativos al estado civil de las personas, a su profesión u oficio y a su calidad de comerciante o de servidor público. Son públicos los Datos Personales existentes en el registro mercantil de las Cámaras de Comercio (artículo 26 del Código de Comercio). Asimismo, son datos públicos, los que, en virtud de una decisión del Titular o de un mandato legal, se encuentren en archivos de libre acceso y consulta. Estos datos pueden ser obtenidos y ofrecidos sin reserva alguna y sin importar si hacen alusión a información general, privada o personal.

• Dato personal semiprivado: dato que no tiene naturaleza íntima, reservada, ni pública y cuyo conocimiento o divulgación puede interesar no sólo a su Titular sino a cierto sector o grupo de personas, o a la sociedad en general. Por ejemplo: el dato referente al cumplimiento e incumplimiento de las obligaciones financieras o los datos relativos a las relaciones con las entidades de la seguridad social.

• Dato personal sensible: dato que afecta la intimidad de la persona o cuyo uso indebido puede generar su discriminación. Por ejemplo: aquellos que revelen el origen racial o étnico, la orientación política, las convicciones religiosas o filosóficas, la pertenencia a sindicatos, organizaciones sociales, de derechos humanos o que promueva intereses de cualquier partido político o que garanticen los derechos y garantías de partidos políticos de oposición, datos relativos a la salud, a la vida sexual y los datos biométricos (huellas dactilares), entre otros.

• Encargado: persona natural o jurídica que realiza el Tratamiento de datos por cuenta del responsable del Tratamiento.

• Autorizado: personas que bajo responsabilidad de la EMPRESA o sus Encargados pueden realizar Tratamiento de Datos Personales en virtud de la Autorización otorgada por el Titular.

• Prueba de la autorización: los responsables deberán conservar prueba de la autorización otorgada por los Titulares de datos personales para el Tratamiento de los mismos.

• Revocatoria de la autorización y/o supresión del dato: los Titulares podrán en todo momento solicitar al responsable o encargado la supresión de sus datos personales y/o revocar la autorización otorgada para el Tratamiento de los mismos, mediante la presentación de un reclamo, de acuerdo con lo establecido en el artículo 15 de la Ley 1581 de 2012.

• Reclamo: es la solicitud del Titular del dato o las personas autorizadas por éste o por la ley para corregir, actualizar o suprimir sus Datos Personales o cuando adviertan que existe un presunto incumplimiento del régimen de protección de datos, según el artículo 15 de la Ley 1581 de 2012.

• Responsable: persona natural o jurídica, pública o privada, que por sí misma o en asocio con otros, decida sobre la base de datos y/o el Tratamiento de los datos.

• Titular del dato: persona natural cuyos datos personales sean objeto de Tratamiento.

• Tratamiento: cualquier operación o conjunto de operaciones sobre Datos Personales como, la recolección, el almacenamiento, el uso, la circulación, transferencia, transmisión, actualización o supresión de los Datos Personales, entre otros. El Tratamiento puede ser nacional (dentro de Colombia) o internacional (fuera de Colombia).

• Transmisión: implica el Tratamiento de datos personales que implica la comunicación de los mismos dentro o fuera del territorio de la República de Colombia cuando tenga por objeto la realización de un Tratamiento por el Encargado por cuenta del responsable.

• Transferencia: implica el Tratamiento de Datos Personales que tiene lugar cuando el responsable y/o Encargado del Tratamiento de Datos Personales, envía los Datos Personales a un receptor, que a su vez es Responsable del Tratamiento y se encuentra dentro o fuera del país.

• Requisito de Procedibilidad: paso previo que debe surtir el Titular antes de interponer una queja ante la Superintendencia de Industria y Comercio. Este consiste en una reclamación directa al Encargado Responsable de sus Datos Personales.

• Incidente de seguridad: se refiere al acceso, intento de acceso, uso, divulgación, modificación o destrucción no autorizada de información; un impedimento en la operación normal de las redes, sistemas o recursos informáticos; o una violación a la política de seguridad de la información.`,
      },
      {
        heading: '6. Principios para el tratamiento de datos personales',
        body: `En el desarrollo, interpretación y aplicación de la presente Política, se aplicarán de manera armónica e integral los siguientes principios:

Relacionados con la recolección de datos personales.

• Principio de Libertad: salvo norma legal en contrario, la recolección de los datos sólo puede ejercerse con la autorización previa, expresa e informada del Titular. Los Datos Personales no podrán ser obtenidos o divulgados sin el previo consentimiento del Titular, o en ausencia de mandato legal o judicial que releve el consentimiento. Se deberá informar al Titular del dato de manera clara, suficiente y previa acerca de la finalidad de la información suministrada y por tanto, no podrán recopilarse datos sin la clara especificación acerca de la finalidad de los mismos.

• Principio de Limitación de la Recolección: sólo deben recolectarse los Datos Personales que sean estrictamente necesarios para el cumplimiento de las finalidades del Tratamiento, de tal forma que se encuentra prohibido el registro y divulgación de datos que no guarden estrecha relación con el objetivo del Tratamiento. En consecuencia, debe hacerse todo lo razonablemente posible para limitar el procesamiento de Datos Personales al mínimo necesario. Es decir, los datos deberán ser: (i) adecuados, (ii) pertinentes y (iii) acordes con las finalidades para las cuales fueron previstos.

• Principio de legalidad en materia de Tratamiento de datos: el Tratamiento a que se refiere la Ley 1581, es una actividad reglada que debe sujetarse a lo establecido en ella y en las demás disposiciones que la desarrollen.

Relacionados con el uso de datos personales.

• Principio de Finalidad: el Tratamiento debe obedecer a una finalidad legítima de acuerdo con la Constitución y la Ley, la cual debe ser informada al Titular de forma previa, clara y suficiente. No podrán recopilarse datos sin una finalidad específica.

• Principio de Temporalidad: los Datos Personales se conservarán únicamente por el tiempo razonable y necesario para cumplir la finalidad del Tratamiento y las exigencias legales o instrucciones de las autoridades de vigilancia y control u otras autoridades competentes. Los datos serán conservados cuando ello sea necesario para el cumplimiento de una obligación legal o contractual. Para determinar el término del Tratamiento se considerarán las normas aplicables a cada finalidad y los aspectos administrativos, contables, fiscales, jurídicos e históricos de la información.

Relacionados con la calidad de la información.

• Principio de Veracidad o Calidad: la información sujeta a Tratamiento debe ser veraz, completa, exacta, actualizada, comprobable y comprensible. Se prohíbe el Tratamiento de datos parciales, incompletos, fraccionados o que induzcan a error. Se deberán adoptar medidas razonables para asegurar que los datos sean precisos y suficientes y, cuando así lo solicite el Titular o cuando la EMPRESA lo determine, sean actualizados, rectificados o suprimidos en caso de ser procedente.

Relacionados con la protección, el acceso y circulación de datos personales.

• Principio de Seguridad: cada persona vinculada con la EMPRESA deberá cumplir las medidas técnicas, humanas y administrativas que establezca la misma para otorgar seguridad a los Datos Personales evitando su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.

• Principio de Transparencia: en el Tratamiento debe garantizarse el derecho del Titular a obtener en cualquier momento y sin restricciones, información acerca de la existencia de datos que le conciernan.

• Principio de Acceso y Circulación Restringida: sólo se permitirá acceso a los Datos Personales a las siguientes personas: (i) al Titular del dato; (ii) a las personas autorizadas por el Titular del dato; (iii) a las personas que por mandato legal u orden judicial sean autorizadas para conocer la información del Titular del dato.

• Principio de Confidencialidad: todas las personas que intervengan en el Tratamiento de Datos Personales que no tengan la naturaleza de públicos están obligadas a garantizar la reserva de la información, inclusive después de finalizada su relación con alguna de las labores que comprende el Tratamiento, pudiendo sólo realizar suministro o comunicación de Datos Personales cuando ello corresponda al desarrollo de las actividades autorizadas en la ley. Todo nuevo proyecto al interior de la EMPRESA, que implique el Tratamiento de Datos Personales deberá ser consultado con el Oficial de Protección de Datos, que es la persona encargada de asegurar el cumplimiento de esta Política y de las medidas necesarias para mantener la confidencialidad del Dato Personal.`,
      },
      {
        heading: '7. Categorías de datos personales tratados',
        body: `${RAZON_SOCIAL} trata las siguientes categorías de datos personales, recolectados directamente del Titular o por intermedio del Aportante:

• Datos de identificación: tipo y número de documento, nombres y apellidos, firma, fotografía cuando se cargue.

• Datos de contacto: correo electrónico, teléfono fijo o móvil, dirección de residencia o de notificaciones.

• Datos socio-demográficos: fecha y lugar de nacimiento, género, nacionalidad, estado civil, nivel educativo, composición familiar cuando sea necesario para beneficios de CCF.

• Datos laborales y de seguridad social: cargo, salario o ingreso base de cotización (IBC), modalidad de afiliación, fechas de ingreso/retiro, novedades, EPS, AFP, ARL, CCF, número de afiliación.

• Datos financieros y de pago: información bancaria para débitos o consignaciones, datos de facturación, historial de pagos. NO almacenamos PAN completo ni CVV de tarjetas; los pagos con tarjeta se procesan a través de pasarelas certificadas PCI-DSS.

• DATOS SENSIBLES (artículo 5 Ley 1581 de 2012): información médica y de salud asociada a incapacidades, licencias de maternidad/paternidad, calificaciones de origen y pérdida de capacidad laboral, soportes médicos cargados al expediente de incapacidades, certificados de discapacidad. Adicionalmente, datos asociados al flujo jurídico (peticiones, tutelas, desacatos, resoluciones) cuando contengan información sensible.

• Datos técnicos y de uso: dirección IP, identificadores de dispositivo, navegador, sistema operativo, logs de actividad, bitácora completa de operaciones críticas, cookies estrictamente necesarias y, previa autorización, cookies analíticas.

• Datos de menores de edad: solo cuando sean indispensables para la afiliación a salud (beneficiarios) o para el reconocimiento de prestaciones, con autorización del representante legal.`,
      },
      {
        heading: '8. Deberes de la empresa cuando obra como Responsable',
        body: `La EMPRESA está obligada a cumplir los deberes impuestos por la ley. Por ende, debe obrar de tal forma que cumpla con los siguientes deberes:

Respecto del Titular del dato.

• Garantizar al Titular, en todo tiempo, el pleno y efectivo ejercicio de los derechos consagrados en esta Política.

Respecto de la calidad, seguridad y confidencialidad de los Datos Personales.

• Observar los principios de veracidad, calidad, seguridad y confidencialidad en los términos establecidos en esta Política.
• Conservar la información bajo las condiciones de seguridad necesarias para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.
• Actualizar la información cuando sea necesario.
• Rectificar los Datos Personales cuando ello sea procedente.

Respecto del Tratamiento a través de un Encargado.

• Suministrar al Encargado del Tratamiento únicamente los Datos Personales cuyo tratamiento esté previamente autorizado.
• Garantizar que la información que se suministre al Encargado del Tratamiento sea veraz, completa, exacta, actualizada, comprobable y comprensible.
• Comunicar de forma oportuna al Encargado del Tratamiento, todas las novedades respecto de los datos que previamente le haya suministrado y adoptar las demás medidas necesarias para que la información suministrada a este se mantenga actualizada.
• Informar de manera oportuna al Encargado del Tratamiento las rectificaciones realizadas sobre los Datos Personales para que éste proceda a realizar los ajustes pertinentes.
• Exigir al Encargado del Tratamiento en todo momento, el respeto a las condiciones de seguridad y privacidad de la información del Titular.
• Informar al Encargado del Tratamiento cuando determinada información se encuentra en discusión por parte del Titular, una vez se haya presentado la reclamación y no haya finalizado el trámite respectivo.

Respecto de la Superintendencia de Industria y Comercio.

• Informarle cuando se presenten violaciones a los códigos de seguridad y existan riesgos en la administración de la información de los Titulares.
• Cumplir las instrucciones y requerimientos que imparta la Superintendencia de Industria y Comercio.`,
      },
      {
        heading: '9. Deberes de la empresa cuando obra como Encargado',
        body: `En caso de Tratamiento de datos en nombre de otra entidad u organización que sea la responsable del Tratamiento, la EMPRESA deberá cumplir los siguientes deberes:

• Garantizar al Titular, en todo tiempo, el pleno y efectivo ejercicio del derecho de habeas data.
• Conservar la información bajo las condiciones de seguridad necesarias para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento.
• Realizar oportunamente la actualización, rectificación o supresión de los datos.
• Actualizar la información reportada por los responsables del Tratamiento dentro de los cinco (5) días hábiles siguientes contados a partir de su recibo.
• Tramitar las consultas y los reclamos formulados por los Titulares en los términos señalados en la presente Política.
• Abstenerse de circular información que esté siendo controvertida por el Titular y cuyo bloqueo haya sido ordenado por la Superintendencia de Industria y Comercio.
• Permitir el acceso a la información únicamente a las personas autorizadas por el Titular o facultadas por la ley para dicho efecto.
• Informar a la Superintendencia de Industria y Comercio cuando se presenten violaciones a los códigos de seguridad y existan riesgos en la administración de la información de los Titulares.
• Cumplir las instrucciones y requerimientos que imparta la Superintendencia de Industria y Comercio.`,
      },
      {
        heading: '10. Terceros a quienes va dirigida la política',
        body: `La presente Política de Tratamiento de Datos Personales está dirigida a:

• Usuarios y/o Asociados.
• Colaboradores.
• Contratistas.
• Clientes Corporativos.
• Proveedores y aliados comerciales.
• Encargados de la Información.
• Cualquier titular de la información, ya sea actuando a nombre propio, o como representante legal, que, con ocasión de las actividades que realice, se encuentre vinculado con ${RAZON_SOCIAL} y se requiera de su información personal para el desarrollo de las mismas.`,
      },
      {
        heading: '11. Responsabilidad limitada',
        body: `Sin perjuicio de lo consagrado en la legislación colombiana aplicable, ${RAZON_SOCIAL} no asume responsabilidad alguna por daño o perjuicio derivado de la pérdida de información, debido a la presencia de virus informáticos resultados del uso o la imposibilidad de usar el material del aplicativo.`,
      },
      {
        heading:
          '12. Tratamiento al cual serán sometidos los datos personales y la finalidad del mismo',
        body: `${RAZON_SOCIAL} realizará el Tratamiento de los Datos Personales de acuerdo con las condiciones establecidas por el Titular, la ley o las entidades públicas para el cumplimiento de las actividades propias de su objeto social como pueden ser la contratación, ejecución y comercialización de los bienes y servicios que ésta ofrece.

El Tratamiento de los Datos Personales se podrá realizar a través de medios físicos, automatizados o digitales de acuerdo con el tipo y forma de recolección de la información.

Finalidades del tratamiento. Los datos personales se tratan para las siguientes finalidades, agrupadas por categoría:

A. Operación del servicio (necesarias para ejecutar el contrato):
• Crear y administrar la cuenta del Usuario.
• Liquidar, validar, generar, presentar y pagar la PILA conforme a la Resolución 2388 de 2016, a través del Operador Autorizado aliado.
• Tramitar afiliaciones, novedades y consultas ante Entidades del SGSS.
• Radicar y hacer seguimiento de incapacidades y licencias.
• Gestionar cartera, recaudo y conciliación.
• Brindar soporte técnico y operativo.

B. Cumplimiento de obligaciones legales:
• Cumplir obligaciones tributarias, contables, comerciales, laborales y de seguridad social.
• Atender requerimientos de autoridades judiciales y administrativas.
• Conservar registros para fines probatorios y de auditoría.

C. Gestión comercial y mejora del servicio:
• Facturación electrónica y cobranza.
• Atender PQRs, comunicaciones operativas y notificaciones.
• Realizar análisis estadísticos, métricas internas y mejorar la calidad del servicio.

D. Finalidades facultativas (requieren autorización adicional y son revocables):
• Envío de comunicaciones comerciales, promocionales o de marketing sobre productos y servicios propios o de aliados.
• Estudios de mercado y encuestas de satisfacción.
• Personalización de contenidos y publicidad.

E. Tratamiento de datos sensibles (facultativo):
• Operar el módulo de incapacidades, gestionar soportes médicos y comunicarse con EPS/ARL para el reconocimiento y pago de prestaciones económicas.`,
      },
      {
        heading: '13. Tiempo de conservación',
        body: `Los datos personales se conservan únicamente por el tiempo razonable y necesario para cumplir las finalidades del tratamiento y las obligaciones legales aplicables, conforme a los siguientes criterios:

• Datos contables, tributarios y de facturación: diez (10) años, conforme al artículo 28 de la Ley 962 de 2005 y al artículo 60 del Código de Comercio.

• Información laboral y de seguridad social: hasta treinta (30) años conforme a la prescripción de las acciones laborales y a las obligaciones de conservación del SGSS, sin perjuicio de plazos mayores cuando aplique.

• Soportes adjuntos a incapacidades (archivos médicos): se mantienen en disco activo por un máximo de ciento veinte (120) días contados desde su cargue; vencido este plazo, los archivos físicos se eliminan de manera segura, conservándose únicamente el registro estructurado de la incapacidad como evidencia.

• Logs y bitácora de auditoría: hasta cinco (5) años o el plazo legal aplicable, lo que sea mayor.

• Datos de marketing y finalidades facultativas: hasta que el Titular revoque la autorización o ejerza derecho de supresión.

• Cuentas inactivas: tras doce (12) meses de inactividad, previa notificación, se procede al cierre y a la conservación únicamente de la información que la ley exija mantener.

Vencidos los plazos de conservación y agotadas las finalidades, los datos se eliminan de forma segura o se anonimizan irreversiblemente.`,
      },
      {
        heading: '14. Derechos del Titular',
        body: `El Titular tiene los siguientes derechos consagrados en el artículo 8 de la Ley 1581 de 2012 y el artículo 21 del Decreto 1377 de 2013:

• Conocer, actualizar y rectificar sus datos personales.
• Solicitar prueba de la autorización otorgada, salvo cuando expresamente se exceptúe.
• Ser informado, previa solicitud, sobre el uso que se ha dado a sus datos.
• Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la Ley 1581 de 2012.
• Revocar la autorización y/o solicitar la supresión del dato cuando el tratamiento no respete principios, derechos y garantías constitucionales y legales, salvo deber legal o contractual de permanencia.
• Acceder en forma gratuita a sus datos personales que hayan sido objeto de tratamiento.

Plazos legales de respuesta:
• Consultas: máximo diez (10) días hábiles desde su recepción, prorrogables hasta por cinco (5) días hábiles más, comunicando los motivos al Titular.
• Reclamos: máximo quince (15) días hábiles desde el día siguiente a su recepción, prorrogables hasta por ocho (8) días hábiles más.

Si no se cumplen los plazos, el Titular podrá acudir a la SIC.`,
      },
      {
        heading: '15. Procedimiento para el ejercicio de derechos',
        body: `Para ejercer cualquiera de los derechos consagrados en la Ley 1581 de 2012, el Titular o sus causahabientes podrán presentar consulta o reclamo a través de:

Canal principal: correo electrónico ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.

La solicitud debe contener:
• Nombres y apellidos completos e identificación del Titular.
• Calidad en la que actúa (titular, representante legal, causahabiente, apoderado).
• Descripción clara y precisa de los hechos y del derecho que pretende ejercer (acceso, actualización, rectificación, supresión, revocación, prueba de autorización).
• Datos de contacto para respuesta (correo y/o dirección).
• Documentos que sustenten la solicitud cuando aplique (copia del documento de identidad, poder, registro civil, etc.).

Trámite. Si la solicitud está incompleta, ${RAZON_SOCIAL} requerirá al Titular dentro de los cinco (5) días hábiles siguientes a la recepción para que subsane las fallas. Transcurridos dos (2) meses sin que se aporte la información, se entenderá desistida la reclamación. Si quien recibe el reclamo no es competente para resolverlo, ${RAZON_SOCIAL} dará traslado a quien corresponda en un plazo máximo de dos (2) días hábiles e informará al Titular.`,
      },
      {
        heading: '16. Cookies y tecnologías similares',
        body: `La Plataforma utiliza cookies y tecnologías similares con los siguientes alcances:

• Cookies estrictamente necesarias: indispensables para el funcionamiento del servicio (autenticación, sesión, balanceo de carga, prevención de fraude). NO requieren consentimiento adicional, pues sin ellas la Plataforma no opera.

• Cookies de preferencias: recuerdan la configuración del Usuario (idioma, tema). Se activan tras aceptación.

• Cookies analíticas: permiten medir uso, tráfico y desempeño del servicio. Se activan únicamente con consentimiento del Usuario mediante el banner de cookies. Pueden incluir herramientas como Google Analytics u otras similares con configuración orientada a la privacidad (anonimización de IP).

• Cookies de marketing/publicidad: SOLO se activan tras consentimiento expreso y pueden ser desactivadas en cualquier momento.

El Usuario puede gestionar las cookies a través del banner de consentimiento de la Plataforma o de la configuración de su navegador. La desactivación de cookies no estrictamente necesarias no afecta el acceso al servicio, aunque puede limitar funcionalidades.`,
      },
      {
        heading: '17. Circuito cerrado de televisión',
        body: `La EMPRESA utiliza circuito cerrado de televisión, instalados en diferentes sitios internos y externos de sus instalaciones y locales. En razón a ello, informa al público en general sobre la existencia de estos mecanismos mediante la difusión en sitios visibles de avisos de zona de video grabado.

Las imágenes y sonidos captados, grabados, transmitidos, almacenados, conservados y reproducidos en tiempo real o posterior, se encuentran sujetos a la política de tratamiento de datos personales que puede consultar y estos datos, solo serán utilizados para fines de seguridad, mejoramiento de nuestro servicio y de la experiencia cuando se encuentre dentro de nuestras instalaciones.`,
      },
      {
        heading: '18. Políticas de seguridad de la información',
        body: `La EMPRESA adoptará las medidas técnicas, administrativas y humanas necesarias para procurar la seguridad de los Datos Personales a los que les da Tratamiento, protegiendo la confidencialidad, integridad, uso, acceso no autorizado y/o fraudulento a éstos. Para tal fin, ha implementado protocolos de seguridad de obligatorio cumplimiento para todo el Personal que tenga acceso a estos datos y/o a los sistemas de información.

Las políticas internas de seguridad bajo las cuales se conserva la información del Titular para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento son incluidas en el Programa Integral de Gestión de Datos Personales de la EMPRESA.

El Tratamiento de los Datos Personales será desde el inicio del Evento hasta el día en que ${RAZON_SOCIAL} se disuelva y se liquide o hasta que se termine la finalidad para la cual fueron recolectados los Datos Personales.`,
      },
      {
        heading: '19. Política para responder a un incidente de seguridad',
        body: `Contener el incidente de seguridad y hacer una evaluación preliminar.

Una vez que la empresa tenga conocimiento de la ocurrencia de un incidente de seguridad debe adoptar las medidas inmediatas para limitar esa falla y evitar cualquier compromiso adicional a la información de carácter personal bajo su cuidado. El responsable de atender la falla debe remitirse al documento Plan de Recuperación de Desastres para ejecutar el plan de acción.

Evaluar los riesgos e impactos asociados con el incidente de seguridad.

Identificar y evaluar el nivel de severidad del incidente de seguridad; la probabilidad de daño para los Titulares de la Información; el nivel de riesgo para sus derechos y libertades; y el Tratamiento que se dará a esos riesgos.

Los niveles de riesgo son:
• Bajo: es improbable que el incidente de seguridad tenga un impacto en las personas, y de generarlo, este sería mínimo.
• Medio: el incidente de seguridad puede tener un impacto en las personas, pero es poco probable que el impacto sea sustancial.
• Alto: el incidente de seguridad puede tener un impacto considerable en las personas afectadas.
• Grave: el incidente de seguridad puede tener un impacto crítico, extenso o peligroso en las personas afectadas.

Identificar los daños para las personas, organizaciones y público en general.

Se debe identificar qué daños podrían resultar del incidente que afecten a las personas, organizaciones y público en general, en aspectos como: riesgo de seguridad física o psicológica, hurto de identidad, suplantación de identidad, pérdida financiera, pérdida reputacional, pérdida de clientes, pérdida de activos, honorarios de terceros, demandas judiciales, riesgo para la seguridad o salud pública.

Notificación a la Superintendencia de Industria y Comercio.

Se debe reportar la ocurrencia del incidente de seguridad ante la SIC sin dilación indebida y a más tardar dentro de los quince (15) días hábiles siguientes al momento en que se detecten y sean puestos en conocimiento de la persona o área encargada de atenderlo. La notificación del incidente de seguridad en Datos Personales debe contener, como mínimo, la información que establece el Registro Nacional de Bases de Datos (RNBD).

Comunicar a los titulares de la información.

El responsable de la protección y tratamiento de datos personales por parte de la EMPRESA debe comunicarse con los Titulares de la información para informarles sobre el incidente de seguridad relacionado con sus Datos Personales y las posibles consecuencias además de proporcionar herramientas a los Titulares para minimizar el daño potencial o causado.

Prevenir futuros incidentes de seguridad en datos personales.

Al finalizar el proceso que mitiga los riesgos asociados con el incidente, se debe hacer una reunión por parte del responsable de la protección y tratamiento de datos personales con la gerencia y demás interesados donde se defina un plan de prevención para evitar futuros eventos que puedan afectar los datos personales que se vieron afectados.`,
      },
      {
        heading: '20. Contacto del responsable de protección de datos',
        body: `${RAZON_SOCIAL} ha designado un área responsable de la atención a peticiones, consultas y reclamos de los Titulares y del cumplimiento de la Ley 1581 de 2012:

Área responsable de protección de datos personales.
Correo electrónico: ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.
Horario de atención: ${HORARIO}.

Autoridad de control. La autoridad competente para conocer reclamos por infracciones a la normatividad de protección de datos personales en Colombia es la Superintendencia de Industria y Comercio (SIC) — www.sic.gov.co.`,
      },
      {
        heading: '21. Disposiciones finales',
        body: `Medidas permanentes. En el tratamiento de datos personales, ${RAZON_SOCIAL}, de manera permanente, verificará en sus procesos, protocolos, procedimientos y políticas, que se garantice el derecho de habeas data a los titulares de la información y que se obtenga con los requisitos de ley, la autorización del titular para el tratamiento de los datos personales.

Manual interno de políticas y procedimientos para el tratamiento de datos personales. La presente política de tratamiento de datos personales, se articula con el Manual interno de Políticas y Procedimientos para el tratamiento de datos personales, el cual establece los criterios, requisitos y procedimientos para que se haga efectiva la presente política.

Fecha de aprobación de la política y entrada en vigencia. ${RAZON_SOCIAL} se reserva el derecho de modificar su Política de Protección de Datos Personales en cualquier momento, cambio que será informado y publicado oportunamente a través de los medios que disponga para tal fin.

Esta política fue actualizada y aprobada el día cinco (05) de mayo del año dos mil veintiséis (2.026), fecha en la que entra en vigencia.`,
      },
    ],
  },

  'habeas-data': {
    title: 'Autorización de tratamiento de datos personales (Habeas Data)',
    subtitle: `${RAZON_SOCIAL} · Ley 1581 de 2012 — Decreto 1377 de 2013`,
    sections: [
      {
        heading: '1. Identificación del Responsable',
        body: `${RAZON_SOCIAL}, sociedad legalmente constituida con NIT ${NIT}, con domicilio principal en ${DIRECCION_FISICA}, ${CIUDAD}, correo electrónico ${EMAIL}, actúa como responsable del Tratamiento de los datos personales recolectados a través de la plataforma ${NOMBRE_PLATAFORMA}.`,
      },
      {
        heading: '2. Manifestación de autorización',
        body: `Yo, en mi calidad de Titular del dato personal o de representante legal del Titular cuando corresponda, declaro que de manera PREVIA, EXPRESA, LIBRE, VOLUNTARIA, INFORMADA E INEQUÍVOCA, autorizo a ${RAZON_SOCIAL} para recolectar, almacenar, consultar, usar, circular, transmitir, transferir, procesar, actualizar, rectificar, suprimir y, en general, dar Tratamiento a los datos personales que he suministrado o suministre en el futuro a través de la Plataforma, sus formularios, canales de atención y cualquier otro medio habilitado, conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013, el Decreto 1074 de 2015 y la Política de tratamiento de datos personales del Responsable, la cual declaro haber leído y comprendido íntegramente.

Esta autorización podrá manifestarse mediante:
• Casilla expresa de aceptación al momento del registro o de la firma electrónica de un documento.
• Aceptación verbal documentada cuando se diligencien formularios asistidos.
• Conductas inequívocas que permitan concluir razonablemente el consentimiento (por ejemplo, completar un formulario habiendo sido informado del aviso de privacidad).

Cuando aplique, este formato podrá presentarse con casillas separables que permitan al Titular autorizar o rechazar de manera independiente:
• Las finalidades necesarias para la prestación del servicio.
• El tratamiento de datos sensibles.
• Las finalidades comerciales y de marketing.`,
      },
      {
        heading: '3. Finalidades específicas autorizadas',
        body: `Autorizo el tratamiento de mis datos personales para las siguientes finalidades:

A. Necesarias para la prestación del servicio:
• Crear y administrar mi cuenta en la Plataforma.
• Liquidar, validar, generar, presentar y pagar la Planilla Integrada de Liquidación de Aportes (PILA), conforme a la Resolución 2388 de 2016, a través del Operador Autorizado aliado.
• Tramitar afiliaciones, novedades y consultas ante Entidades del SGSS (EPS, AFP, ARL, CCF, ICBF, SENA).
• Radicar y hacer seguimiento de incapacidades, licencias y demás prestaciones económicas.
• Gestionar cartera, cobranza, recaudo y conciliación.
• Apoyar trámites jurídicos asociados (peticiones, tutelas, desacatos, resoluciones) cuando el servicio lo contemple.
• Atender PQRs y comunicaciones operativas.

B. Cumplimiento de obligaciones legales:
• Cumplir obligaciones tributarias, contables, comerciales, laborales, mercantiles y de seguridad social.
• Conservar la información para fines probatorios, de auditoría y de control.
• Atender requerimientos de autoridades judiciales y administrativas competentes.

C. Transmisión a terceros estrictamente para los fines anteriores:
• Operador Autorizado de PILA, Entidades del SGSS, asesores externos sometidos a confidencialidad, proveedores de infraestructura cloud (Neon en Estados Unidos, Sentry, Amazon S3) bajo cláusulas contractuales que garantizan estándares equivalentes a la Ley 1581 de 2012, pasarelas de pago y entidades financieras.

D. Finalidades FACULTATIVAS (autorización adicional, separable y revocable):
• Envío de comunicaciones comerciales, promocionales o de marketing sobre productos y servicios propios o de aliados.
• Estudios de mercado, encuestas de satisfacción y mejora de la experiencia.
• Personalización de contenidos.

El Titular puede negarse a las finalidades facultativas (D) sin que ello afecte la prestación de los servicios principales (A, B y C).`,
      },
      {
        heading: '4. Tratamiento de datos sensibles — carácter facultativo',
        body: `Declaro haber sido informado de que, conforme al artículo 5 de la Ley 1581 de 2012, son datos sensibles aquellos que afectan la intimidad o cuyo uso indebido puede generar discriminación, en particular los relativos a la salud, los datos biométricos y la información médica.

En el contexto de ${NOMBRE_PLATAFORMA}, son datos sensibles, entre otros: información médica asociada a incapacidades, certificados médicos, soportes de licencia de maternidad/paternidad, calificaciones de origen y de pérdida de capacidad laboral, información de salud cargada en el flujo jurídico.

Tratamiento facultativo. AUTORIZO de manera expresa el tratamiento de mis datos sensibles para las finalidades descritas. Declaro que esta autorización ES FACULTATIVA Y NO ES REQUISITO PARA EL ACCESO A LOS SERVICIOS BÁSICOS, sin perjuicio de que la negativa pueda hacer técnicamente inviable la prestación de servicios cuyo objeto requiere esos datos (por ejemplo, gestión de incapacidades).

Puedo revocar esta autorización en cualquier momento.

Garantías. ${RAZON_SOCIAL} aplicará medidas reforzadas de seguridad sobre estos datos (cifrado, control de acceso granular, registros de auditoría) y restringirá su acceso al personal estrictamente necesario, sometido a deber de confidencialidad reforzado.`,
      },
      {
        heading: '5. Tratamiento de datos de menores de edad',
        body: `Cuando esta autorización se diligencie respecto de un menor de edad (por ejemplo, beneficiarios en salud o cotizantes menores cuando aplique), declaro que actúo como representante legal del menor (padre, madre, tutor o curador), que cuento con facultad legal para otorgar la autorización en su nombre, y que el tratamiento se realizará respetando el interés superior del niño, niña o adolescente, conforme al artículo 12 del Decreto 1377 de 2013 y la Sentencia T-260 de 2012 de la Corte Constitucional.`,
      },
      {
        heading: '6. Derechos del Titular y procedimiento para ejercerlos',
        body: `Como Titular tengo derecho, conforme al artículo 8 de la Ley 1581 de 2012, a:

• Conocer, actualizar y rectificar mis datos personales.
• Solicitar prueba de la autorización otorgada.
• Ser informado del uso que se ha dado a mis datos.
• Presentar quejas ante la Superintendencia de Industria y Comercio.
• Revocar la autorización y/o solicitar la supresión cuando no se respeten principios, derechos y garantías constitucionales y legales.
• Acceder en forma gratuita a mis datos personales.

Procedimiento. Puedo ejercer estos derechos enviando comunicación escrita a:

Correo electrónico: ${EMAIL}.
Dirección física: ${DIRECCION_FISICA}, ${CIUDAD}.

La solicitud debe contener:
• Nombres, apellidos completos e identificación.
• Calidad en la que actúo (titular, representante, causahabiente, apoderado).
• Descripción clara del derecho que ejerzo y de los hechos.
• Datos de contacto para respuesta.
• Documentos de soporte cuando apliquen.

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
          </div>
        </Dialog>
      )}
    </>
  );
}
