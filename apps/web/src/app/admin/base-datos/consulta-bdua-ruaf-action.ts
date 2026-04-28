'use server';

/**
 * Server action — consulta BDUA/RUAF desde el formulario de "Nueva
 * afiliación". Se llama imperativamente desde el cliente (no desde
 * useActionState) porque es una consulta puntual que prellena campos,
 * no un submit de formulario.
 *
 * Flujo:
 *   1. Valida sesión (cualquier usuario autenticado con acceso al form).
 *   2. Normaliza documento (trim, uppercase en tipo).
 *   3. Llama PagoSimple y retorna el item del cotizante (affiliate_type='C').
 *   4. Traduce errores a mensajes user-friendly.
 *
 * Retorna un discriminated union para que el cliente haga render diferenciado.
 */

import { requireAuth } from '@/lib/auth-helpers';
import { isPagosimpleEnabled } from '@/lib/pagosimple/config';
import { consultarCotizanteBduaRuaf } from '@/lib/pagosimple/bdua-ruaf';
import { getBduaCached, setBduaCached, invalidateBduaCached } from '@/lib/pagosimple/bdua-cache';
import { PagosimpleError } from '@/lib/pagosimple/client';
import type { BduaRuafItem } from '@/lib/pagosimple/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('bdua-ruaf');

export type BduaRuafResult =
  | { ok: true; item: BduaRuafItem | null; cached?: boolean }
  | { ok: false; error: string; code?: number };

export async function consultarBduaRuafAction(
  tipoDocumento: string,
  numeroDocumento: string,
  options: { forceFresh?: boolean } = {},
): Promise<BduaRuafResult> {
  await requireAuth();

  if (!isPagosimpleEnabled()) {
    return {
      ok: false,
      error: 'La integración con PagoSimple no está configurada. Avisa a administración.',
    };
  }

  const tipo = (tipoDocumento ?? '').trim().toUpperCase();
  const num = (numeroDocumento ?? '').trim();
  if (!tipo) return { ok: false, error: 'Falta el tipo de documento.' };
  if (!num) return { ok: false, error: 'Falta el número de documento.' };
  if (num.length < 4) {
    return { ok: false, error: 'El número de documento es demasiado corto.' };
  }

  // Cache lookup primero — si tenemos respuesta vigente (<30 min) y el
  // caller NO pidió forceFresh, devolvemos sin pegar a PagoSimple.
  // Cacheamos también `null` (persona sin registro en BDUA) — es
  // información válida y permite no re-preguntar.
  if (!options.forceFresh) {
    const cached = getBduaCached(tipo, num);
    if (cached !== undefined) {
      return { ok: true, item: cached, cached: true };
    }
  } else {
    // Bypass explícito: limpiar la entrada vieja antes de re-consultar
    // para que un eventual fallo de PagoSimple deje el cache también limpio.
    invalidateBduaCached(tipo, num);
  }

  try {
    const item = await consultarCotizanteBduaRuaf(tipo, num);
    setBduaCached(tipo, num, item);
    return { ok: true, item, cached: false };
  } catch (err) {
    if (err instanceof PagosimpleError) {
      // Algunos códigos son "soft" (persona no encontrada) y otros son
      // errores reales (sesión, red, etc.). Los diferenciamos por mensaje.
      const msg = err.message.toLowerCase();
      if (
        err.code === 404 ||
        msg.includes('no encontrado') ||
        msg.includes('not found') ||
        msg.includes('sin registros')
      ) {
        // Cacheamos el "no encontrado" como null para no re-preguntar.
        setBduaCached(tipo, num, null);
        return { ok: true, item: null, cached: false };
      }
      return {
        ok: false,
        error: `PagoSimple (${err.code}): ${err.message}`,
        code: err.code,
      };
    }
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    log.error({ err: msg }, 'consulta BDUA/RUAF falló');
    return { ok: false, error: `No se pudo consultar BDUA/RUAF: ${msg}` };
  }
}
