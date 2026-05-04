import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { requireRole } from '@/lib/auth-helpers';
import { dispararBotColpatria } from '@/lib/colpatria/dispatch';

export const dynamic = 'force-dynamic';

/**
 * POST /api/colpatria/disparar-login — dispara el comando `login-auto`
 * del bot para todas las empresas con `colpatriaActivo=true`.
 *
 * Mismo patrón que `/api/colpatria/procesar-ahora`: spawn local en dev,
 * `workflow_dispatch` en prod. Workflow:
 * `.github/workflows/bot-colpatria-login-auto.yml`.
 *
 * Solo STAFF (ADMIN/SOPORTE).
 */
export async function POST() {
  await requireRole('ADMIN', 'SOPORTE');

  const cuentaActivas = await prisma.empresa.count({
    where: {
      active: true,
      colpatriaActivo: true,
      colpatriaUsuario: { not: null },
      colpatriaPasswordEnc: { not: null },
    },
  });

  if (cuentaActivas === 0) {
    return NextResponse.json(
      {
        kind: 'NADA_QUE_HACER',
        message: 'No hay empresas con Colpatria activo y credenciales completas.',
        empresas: 0,
      },
      { status: 200 },
    );
  }

  const resultado = await dispararBotColpatria({
    comando: 'login-auto',
    workflowFile: 'bot-colpatria-login-auto.yml',
  });

  return NextResponse.json(
    {
      kind: resultado.kind,
      message: resultado.message,
      empresas: cuentaActivas,
    },
    { status: resultado.status },
  );
}
