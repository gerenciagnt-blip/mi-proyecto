/**
 * Retención de 120 días para documentos de Soporte · Afiliaciones.
 *
 * Misma política que Incapacidades: el archivo físico se elimina tras
 * 120 días desde su subida, pero el registro en BD permanece como
 * evidencia (hash, mime, size, nombre original, user que subió).
 */

import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '@pila/db';
import { uploadsRoot } from '../cartera/storage';

export const DIAS_RETENCION = 120;

export type LimpiezaResultado = {
  evaluados: number;
  eliminados: number;
  errores: Array<{ documentoId: string; mensaje: string }>;
};

export async function limpiarDocumentosSoporteAfVencidos(
  ahora = new Date(),
): Promise<LimpiezaResultado> {
  const limite = new Date(ahora);
  limite.setUTCDate(limite.getUTCDate() - DIAS_RETENCION);

  const vencidos = await prisma.soporteAfDocumento.findMany({
    where: {
      eliminado: false,
      createdAt: { lt: limite },
    },
    select: { id: true, archivoPath: true },
  });

  const root = uploadsRoot();
  const errores: LimpiezaResultado['errores'] = [];
  let eliminados = 0;

  for (const doc of vencidos) {
    const abs = resolve(join(root, doc.archivoPath));
    if (!abs.startsWith(root)) {
      errores.push({
        documentoId: doc.id,
        mensaje: `Ruta fuera del raíz de uploads: ${doc.archivoPath}`,
      });
      continue;
    }
    try {
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errores.push({
          documentoId: doc.id,
          mensaje: err instanceof Error ? err.message : 'Error desconocido',
        });
        continue;
      }
    }
    await prisma.soporteAfDocumento.update({
      where: { id: doc.id },
      data: { eliminado: true, eliminadoEn: new Date() },
    });
    eliminados++;
  }

  return { evaluados: vencidos.length, eliminados, errores };
}
