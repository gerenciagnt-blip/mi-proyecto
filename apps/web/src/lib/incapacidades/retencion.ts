/**
 * Retención de 120 días para documentos de incapacidad.
 *
 * El docx original dice:
 *   "los documentos queden en archivo durante 120 días; al 121 se
 *    empiezan a eliminar, pero queda el registro en texto como evidencia
 *    de que sí se cargaron."
 *
 * Este módulo recorre los `IncapacidadDocumento` creados hace más de 120
 * días cuyo `eliminado=false`, borra el archivo físico del disco y marca
 * la fila como eliminada (conserva hash/mime/size/nombre original).
 *
 * Se puede invocar:
 *   - Vía CLI: `pnpm run cli incapacidades:limpiar` (pendiente wire-up)
 *   - Vía cron en producción (ej. daily en Vercel Cron o GitHub Actions)
 *   - Vía script ad-hoc desde el admin (proxima iteración)
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

export async function limpiarDocumentosIncapacidadVencidos(
  ahora = new Date(),
): Promise<LimpiezaResultado> {
  const limite = new Date(ahora);
  limite.setUTCDate(limite.getUTCDate() - DIAS_RETENCION);

  const vencidos = await prisma.incapacidadDocumento.findMany({
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
    // Seguridad: el path debe estar dentro de uploadsRoot. Si no, se omite
    // y se loggea (nunca debería pasar, pero defense-in-depth).
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
      // Si el archivo ya no existe, igual marcamos eliminado — el registro
      // se conserva como evidencia. Cualquier otro error lo registramos.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errores.push({
          documentoId: doc.id,
          mensaje: err instanceof Error ? err.message : 'Error desconocido',
        });
        continue;
      }
    }
    await prisma.incapacidadDocumento.update({
      where: { id: doc.id },
      data: { eliminado: true, eliminadoEn: new Date() },
    });
    eliminados++;
  }

  return { evaluados: vencidos.length, eliminados, errores };
}
