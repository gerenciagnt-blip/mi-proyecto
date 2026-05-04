import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { dispararBotColpatria } from '@/lib/colpatria/dispatch';

export const dynamic = 'force-dynamic';

/**
 * POST /api/colpatria/disparar-logout — dispara el comando `logout-auto`
 * del bot. Borra el `storageState` cifrado en `ColpatriaSesion` para
 * todas las empresas con sesión activa. No navega al portal AXA.
 *
 * Workflow: `.github/workflows/bot-colpatria-logout-auto.yml`.
 *
 * Solo STAFF (ADMIN/SOPORTE).
 */
export async function POST() {
  await requireRole('ADMIN', 'SOPORTE');

  const cuentaSesiones = await prisma.colpatriaSesion.count();

  if (cuentaSesiones === 0) {
    return NextResponse.json(
      {
        kind: 'NADA_QUE_HACER',
        message: 'No hay sesiones cacheadas para cerrar.',
        sesiones: 0,
      },
      { status: 200 },
    );
  }

  const resultado = await dispararBotColpatria({
    comando: 'logout-auto',
    workflowFile: 'bot-colpatria-logout-auto.yml',
  });

  return NextResponse.json(
    {
      kind: resultado.kind,
      message: resultado.message,
      sesiones: cuentaSesiones,
    },
    { status: resultado.status },
  );
}
