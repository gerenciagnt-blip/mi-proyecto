/**
 * Sprint Chat · constantes compartidas server + client.
 *
 * No tiene `'use server'`: Next.js 15 exige que un módulo con esa
 * directiva solo exporte funciones async. Para constantes/tipos
 * compartidos por ambos lados, vivir en un módulo neutro como éste.
 */

/**
 * Set fijo de emojis permitidos para reaccionar a un mensaje. El server
 * valida contra este array (en `toggleReaccionAction`); el cliente lo
 * usa para pintar el mini-picker en hover.
 */
export const EMOJIS_REACCION_VALIDOS = ['👍', '❤️', '😂', '🎉', '😮', '😢'] as const;

export type EmojiReaccion = (typeof EMOJIS_REACCION_VALIDOS)[number];

export function esEmojiReaccionValido(e: string): e is EmojiReaccion {
  return (EMOJIS_REACCION_VALIDOS as readonly string[]).includes(e);
}
