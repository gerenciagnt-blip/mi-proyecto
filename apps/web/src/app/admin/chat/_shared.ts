/**
 * Tipos y constantes compartidos por las server actions del chat.
 *
 * Antes vivían inline en `actions.ts` (1242 LOC). Extraídos para reducir
 * el tamaño del archivo principal sin tocar la lógica de las actions
 * (cero cambios de comportamiento — solo reestructura).
 *
 * Este archivo NO tiene `'use server'`: contiene solo tipos puros y
 * constantes. Lo importan tanto `actions.ts` (que sí es server) como
 * `_helpers.ts` (helpers internos no exportados al cliente).
 */

import type { ConversacionTipo, ConversacionEstado } from '@pila/db';

// ============ Constantes ============

/** Umbral en ms para considerar a un participante "frío" (no ha leído
 *  en X tiempo y por tanto se le emite notificación al recibir un
 *  mensaje nuevo). Sprint Chat · notif bandeja. */
export const UMBRAL_FRIO_MS = 2 * 60 * 1000; // 2 min

/** Ventana para dedup de notificaciones de chat: no se emite otra notif
 *  para el mismo (user, conversacion) si hay una de hace <DEDUP_MS. */
export const DEDUP_MS = 5 * 60 * 1000; // 5 min

/** Tamaño máximo de un mensaje en caracteres. */
export const MAX_CONTENIDO = 4000;

/** Máximo de mensajes que devuelve `listarMensajesAction` por página. */
export const MAX_MENSAJES_PAGE = 100;

/** Sprint Chat · edit — ventana para editar un mensaje. Después de N
 *  minutos del envío, el botón "Editar" desaparece en la UI. */
export const VENTANA_EDIT_MS = 15 * 60 * 1000; // 15 min

// ============ Tipos de retorno de actions ============

export type ActionState = { error?: string; ok?: boolean };

export type ConversacionListItem = {
  id: string;
  tipo: ConversacionTipo;
  titulo: string;
  /** Para DMs: el otherUserId — para abrir directo o linkar. */
  otherUserId: string | null;
  ultimoMensajeAt: string | null;
  ultimoMensajePreview: string | null;
  ultimoMensajeAutorNombre: string | null;
  unreadCount: number;
  totalParticipantes: number;
  estado: ConversacionEstado;
  cerradaAt: string | null;
  ciclo: number;
};

export type MensajeAdjuntoItem = {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  ancho: number | null;
  alto: number | null;
  /** URL relativa para mostrar el archivo (apunta al endpoint /api/chat/adjuntos/...). */
  url: string;
};

/** Sprint Chat · reacciones — reacción de un emoji agrupada sobre un mensaje.
 *  - `count`: cuántos usuarios reaccionaron con este emoji.
 *  - `miReaccion`: true si el actor actual está entre ellos.
 *  - `usuarios`: nombres para tooltip (máximo razonable; si llegamos a
 *    grupos masivos truncar en cliente).
 */
export type MensajeReaccionItem = {
  emoji: string;
  count: number;
  miReaccion: boolean;
  usuarios: string[];
};

/** Sprint Chat · menciones — referencia simple al usuario mencionado.
 *  La UI usa el `name` para reemplazar la primera ocurrencia de `@<name>`
 *  en el texto por un chip; el `id` lo necesita para destacar cuando el
 *  mencionado soy yo. */
export type MensajeMencionItem = {
  id: string;
  name: string;
};

export type MensajeItem = {
  id: string;
  contenido: string;
  createdAt: string;
  editadoAt: string | null;
  borradoAt: string | null;
  autor: { id: string; name: string };
  adjuntos: MensajeAdjuntoItem[];
  /** Sprint Chat · reacciones — agrupadas por emoji. Vacío si nadie ha
   *  reaccionado, o si el mensaje está borrado (la BD las conserva pero la
   *  UI las oculta). */
  reacciones: MensajeReaccionItem[];
  /** Sprint Chat · menciones — users mencionados con @<nombre>. Vacío en
   *  mensajes borrados aunque la BD las conserve. */
  menciones: MensajeMencionItem[];
};

export type ConversacionMeta = {
  id: string;
  estado: ConversacionEstado;
  ciclo: number;
  cerradaAt: string | null;
  cerradaPorInactividad: boolean;
  cerradaPorNombre: string | null;
  tieneStaff: boolean;
  /** True si el actor es no-staff Y la conv tiene staff Y aún no calificó este ciclo. */
  debeCalificar: boolean;
  /** Sprint Chat · edit/delete — userId del actor actual, para que la UI
   *  decida si mostrar el menú "Editar/Borrar" en cada mensaje. */
  meId: string;
  /** True si el actor es ADMIN de la conv (puede borrar mensajes ajenos
   *  de no-staff). */
  soyAdminConv: boolean;
};

/** Sprint Chat · menciones — item del autocomplete de `@` en el composer. */
export type ParticipanteAutocomplete = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type CrearConversacionResult =
  | { ok: true; conversacionId: string; existente: boolean }
  | { ok: false; error: string };

export type UsuarioElegible = {
  id: string;
  name: string;
  email: string;
  role: string;
  sucursalCodigo: string | null;
};

// ============ Helpers puros ============

/** Roles considerados "staff" para reglas de calificación. */
export function esStaffRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SOPORTE';
}
