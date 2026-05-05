/**
 * Notificaciones para PQRS — disparo cuando se recibe una nueva o cuando
 * cambia de estado.
 *
 * STATUS V1: las funciones de envío real están como STUB. Se loguea con
 * pino y se marcan los timestamps `notificadoEmailEn` / `notificadoWhatsappEn`
 * en la BD para tracking. Cuando lleguen credenciales reales:
 *
 *   - EMAIL: Sprint 4.4 pendiente. Reemplazar `enviarEmailStub` por una
 *     llamada a Resend (paquete `resend` ya en npm). Variables de entorno:
 *     RESEND_API_KEY + RESEND_FROM_EMAIL.
 *
 *   - WHATSAPP: Sprint 4.5 pendiente. Opciones:
 *     (a) WhatsApp Business API oficial (Cloud API de Meta) — requiere
 *         número verificado de business + tokens de acceso.
 *     (b) Twilio WhatsApp API — más simple para empezar pero más caro.
 *     Reemplazar `enviarWhatsappStub` con la integración elegida.
 */

import { prisma } from '@pila/db';
import { createLogger } from '@/lib/logger';
import { PQRS_TIPO_LABEL, PLAZOS_DIAS_HABILES } from './plazos';

const log = createLogger('pqrs-notifs');

const ADMIN_EMAIL = process.env.PQRS_ADMIN_EMAIL ?? 'gerencia.gnt@gmail.com';
const ADMIN_WHATSAPP = process.env.PQRS_ADMIN_WHATSAPP ?? '573000000000';

type PqrsForNotif = {
  id: string;
  consecutivo: string;
  tipo: keyof typeof PQRS_TIPO_LABEL;
  asunto: string;
  nombres: string;
  apellidos: string | null;
  email: string;
  telefono: string;
  numeroDocumento: string;
  empresaNombre: string | null;
};

/**
 * Notifica al admin que entró una PQRS nueva. Se llama desde el server
 * action público después de crear el registro.
 *
 * Fire-and-forget: no bloquea la respuesta al usuario. Si falla, se
 * loguea pero la PQRS ya quedó guardada — el admin la ve en el panel.
 */
export async function notificarNuevaPqrs(pqrs: PqrsForNotif): Promise<void> {
  const tipoLabel = PQRS_TIPO_LABEL[pqrs.tipo];
  const plazo = PLAZOS_DIAS_HABILES[pqrs.tipo];
  const nombreCompleto = [pqrs.nombres, pqrs.apellidos].filter(Boolean).join(' ');

  const subject = `[Sistema PILA] Nueva ${tipoLabel}: ${pqrs.consecutivo}`;
  const body =
    `Se recibió una nueva PQRS desde la landing pública.\n\n` +
    `Consecutivo: ${pqrs.consecutivo}\n` +
    `Tipo: ${tipoLabel}\n` +
    `Asunto: ${pqrs.asunto}\n` +
    `Plazo de respuesta: ${plazo} días hábiles\n\n` +
    `Solicitante:\n` +
    `  Nombre: ${nombreCompleto}\n` +
    `  Documento: ${pqrs.numeroDocumento}\n` +
    `  Email: ${pqrs.email}\n` +
    `  Teléfono: ${pqrs.telefono}\n` +
    (pqrs.empresaNombre ? `  Empresa: ${pqrs.empresaNombre}\n` : '') +
    `\nGestionar en: /admin/soporte/juridico?seccion=pqrs`;

  // Disparo paralelo de email + WhatsApp. Los stubs no fallan en runtime.
  const [emailOk, waOk] = await Promise.all([
    enviarEmailStub({ to: ADMIN_EMAIL, subject, body, pqrsId: pqrs.id }),
    enviarWhatsappStub({
      to: ADMIN_WHATSAPP,
      message: `🆕 ${tipoLabel} ${pqrs.consecutivo}\n${nombreCompleto} · ${pqrs.email}\nAsunto: ${pqrs.asunto}\nPlazo: ${plazo} días hábiles`,
      pqrsId: pqrs.id,
    }),
  ]);

  // Marcar timestamps de notificación enviada (aunque sea stub) — útil
  // para que la UI muestre "notificado hace X min" y para tracking
  // cuando se active la integración real.
  await prisma.pqrs
    .update({
      where: { id: pqrs.id },
      data: {
        notificadoEmailEn: emailOk ? new Date() : null,
        notificadoWhatsappEn: waOk ? new Date() : null,
      },
    })
    .catch((err) => {
      log.warn(
        { err: String(err), pqrsId: pqrs.id },
        'No se pudo marcar timestamp de notificación',
      );
    });
}

// ─────────────────────────────────────────────────────────────────────
// STUBS — reemplazar por integración real cuando lleguen credenciales
// ─────────────────────────────────────────────────────────────────────

async function enviarEmailStub({
  to,
  subject,
  body,
  pqrsId,
}: {
  to: string;
  subject: string;
  body: string;
  pqrsId: string;
}): Promise<boolean> {
  // TODO Sprint 4.4: integrar Resend.
  //   import { Resend } from 'resend';
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to, subject, text: body });
  log.info(
    { pqrsId, to, subject, bodyPreview: body.slice(0, 100) },
    'Email PQRS (stub — pendiente integrar Resend)',
  );
  return true; // tratamos el stub como exitoso para que el tracking se actualice
}

async function enviarWhatsappStub({
  to,
  message,
  pqrsId,
}: {
  to: string;
  message: string;
  pqrsId: string;
}): Promise<boolean> {
  // TODO Sprint 4.5: integrar WhatsApp Business API o Twilio.
  //   await fetch('https://graph.facebook.com/v18.0/<phone-id>/messages', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ... },
  //     body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
  //   });
  log.info(
    { pqrsId, to, messagePreview: message.slice(0, 80) },
    'WhatsApp PQRS (stub — pendiente integrar WA Business API)',
  );
  return true;
}

/**
 * Notifica al solicitante que su PQRS fue respondida. Se llama desde
 * el server action de admin al marcar como RESPONDIDA.
 */
export async function notificarRespuestaAlSolicitante(pqrs: {
  id: string;
  consecutivo: string;
  email: string;
  telefono: string;
  nombres: string;
  asunto: string;
  respuesta: string;
}): Promise<void> {
  const subject = `[Sistema PILA] Respuesta a tu PQRS ${pqrs.consecutivo}`;
  const body =
    `Hola ${pqrs.nombres},\n\n` +
    `Hemos respondido tu PQRS:\n` +
    `Consecutivo: ${pqrs.consecutivo}\n` +
    `Asunto: ${pqrs.asunto}\n\n` +
    `Respuesta:\n${pqrs.respuesta}\n\n` +
    `Si tu inquietud no fue resuelta, responde a este correo o ` +
    `escríbenos directamente a ${ADMIN_EMAIL}.\n\n` +
    `— Equipo Sistema PILA`;
  await enviarEmailStub({ to: pqrs.email, subject, body, pqrsId: pqrs.id });
  await enviarWhatsappStub({
    to: pqrs.telefono,
    message: `Hola ${pqrs.nombres}, tu PQRS ${pqrs.consecutivo} fue respondida. Revisa tu correo o ingresa al portal.`,
    pqrsId: pqrs.id,
  });
}
