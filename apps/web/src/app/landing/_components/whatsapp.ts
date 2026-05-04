/**
 * Constantes y helpers para integración WhatsApp en la landing.
 *
 * TODO: cambiar `WHATSAPP_NUMBER` al número real comercial cuando el
 * operador lo confirme. Formato: solo dígitos con código país, sin
 * `+`, espacios ni guiones (es lo que espera wa.me).
 */

// +57 300 000 0000 → '573000000000' (placeholder)
export const WHATSAPP_NUMBER = '573000000000';

/**
 * Construye la URL de wa.me con texto pre-rellenado. El mensaje
 * se URL-encodea automáticamente.
 *
 * Uso:
 *   <a href={waUrl('Hola, me interesa Sistema PILA')} target="_blank">
 */
export function waUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Mensajes pre-armados por contexto. Centralizados para coherencia. */
export const WA_MENSAJES = {
  contactoComercial: 'Hola, me interesa Sistema PILA. ¿Podemos hablar?',
  preguntaFaq:
    'Hola, tengo una pregunta sobre Sistema PILA que no encontré en las preguntas frecuentes:\n\n',
  flotanteGeneral: 'Hola, me gustaría más información sobre Sistema PILA.',
};
