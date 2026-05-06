'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-helpers';
import { solicitarCertificado, usuarioPuedeVerAfiliacion } from '@/lib/colpatria/certificados';

/**
 * Server action que dispara la solicitud de certificado de afiliación
 * vigente. Cualquier usuario autenticado con acceso a la afiliación
 * puede pedirlo (STAFF cross-sucursal, ALIADO_OWNER/USER de su
 * sucursal).
 *
 * Devuelve el `jobId` para que el cliente haga polling al endpoint
 * de status hasta que el bot termine.
 */
export async function solicitarCertificadoColpatriaAction(
  afiliacionId: string,
): Promise<{ ok: true; jobId: string; mensaje: string } | { ok: false; error: string }> {
  const session = await requireAuth();
  const user = session.user;

  const tieneAcceso = await usuarioPuedeVerAfiliacion(afiliacionId, {
    role: user.role,
    sucursalId: user.sucursalId,
  });
  if (!tieneAcceso) {
    return { ok: false, error: 'No tienes acceso a esta afiliación' };
  }

  const r = await solicitarCertificado({
    afiliacionId,
    requestedById: user.id,
  });

  if (!r.ok) return r;

  // Refrescar la página para que el badge "certificado en curso"
  // aparezca al recargar (el polling del modal lleva el estado vivo).
  revalidatePath('/admin/base-datos');
  return { ok: true, jobId: r.jobId, mensaje: r.dispatch };
}
