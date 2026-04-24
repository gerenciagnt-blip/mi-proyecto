'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { nextMovimientoIncConsecutivo } from '@/lib/finanzas/consecutivos';
import { parseExtractoBancario } from '@/lib/finanzas/parser-extracto';

export type ActionState = {
  error?: string;
  ok?: boolean;
  /** Resumen del import para mostrar en la UI. */
  importSummary?: {
    leidos: number;
    creados: number;
    duplicados: number;
    errores: string[];
    columnasDetectadas: {
      fecha: string | null;
      concepto: string | null;
      valor: string | null;
      banco: string | null;
    };
  };
};

/**
 * Sube un extracto bancario (Excel/CSV), parsea y crea movimientos evitando
 * duplicados por hash de identidad.
 */
export async function importarExtractoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();
  const file = formData.get('archivo');
  const bancoDefault = String(formData.get('bancoDefault') ?? '').trim() || undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo Excel o CSV.' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'Archivo demasiado grande (máx. 10 MB).' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parse = parseExtractoBancario(buf, { bancoDefault });

  if (!parse.ok || parse.registros.length === 0) {
    return {
      error: parse.errores[0] ?? 'No se detectaron movimientos en el archivo.',
      importSummary: {
        leidos: 0,
        creados: 0,
        duplicados: 0,
        errores: parse.errores,
        columnasDetectadas: parse.columnasDetectadas,
      },
    };
  }

  // Filtra duplicados por hashIdentidad (pueden venir repetidos en el archivo)
  const hashes = Array.from(new Set(parse.registros.map((r) => r.hashIdentidad)));
  const existentes = await prisma.movimientoIncapacidad.findMany({
    where: { hashIdentidad: { in: hashes } },
    select: { hashIdentidad: true },
  });
  const hashExistentes = new Set(
    existentes.map((e) => e.hashIdentidad).filter(Boolean) as string[],
  );

  const nuevos = parse.registros.filter((r) => !hashExistentes.has(r.hashIdentidad));
  const duplicados = parse.registros.length - nuevos.length;

  if (nuevos.length === 0) {
    return {
      ok: true,
      importSummary: {
        leidos: parse.registros.length,
        creados: 0,
        duplicados,
        errores: parse.errores,
        columnasDetectadas: parse.columnasDetectadas,
      },
    };
  }

  // Crear todos en transacción — cada uno necesita su propio consecutivo
  // (llamadas a nextval secuenciales para mantener orden).
  try {
    for (const r of nuevos) {
      const consec = await nextMovimientoIncConsecutivo();
      await prisma.movimientoIncapacidad.create({
        data: {
          consecutivo: consec,
          fechaIngreso: r.fechaIngreso,
          concepto: r.concepto,
          valor: new Prisma.Decimal(r.valor),
          bancoOrigen: r.bancoOrigen,
          hashIdentidad: r.hashIdentidad,
          estado: 'PENDIENTE',
          createdById: session.user.id,
        },
      });
    }
  } catch (e) {
    return {
      error: `Error al guardar: ${e instanceof Error ? e.message : 'desconocido'}`,
      importSummary: {
        leidos: parse.registros.length,
        creados: 0,
        duplicados,
        errores: parse.errores,
        columnasDetectadas: parse.columnasDetectadas,
      },
    };
  }

  revalidatePath('/admin/soporte/finanzas/movimientos-incapacidades');
  return {
    ok: true,
    importSummary: {
      leidos: parse.registros.length,
      creados: nuevos.length,
      duplicados,
      errores: parse.errores,
      columnasDetectadas: parse.columnasDetectadas,
    },
  };
}

/** Anula un movimiento (solo si está PENDIENTE o CONCILIADO sin detalles). */
export async function anularMovimientoAction(id: string): Promise<ActionState> {
  await requireStaff();
  const mov = await prisma.movimientoIncapacidad.findUnique({
    where: { id },
    select: { estado: true, _count: { select: { detalles: true } } },
  });
  if (!mov) return { error: 'Movimiento no existe' };
  if (mov.estado === 'ANULADO') return { error: 'Ya está anulado' };
  if (mov._count.detalles > 0) {
    return { error: 'No se puede anular: tiene detalles asociados' };
  }
  await prisma.movimientoIncapacidad.update({
    where: { id },
    data: { estado: 'ANULADO' },
  });
  revalidatePath('/admin/soporte/finanzas/movimientos-incapacidades');
  return { ok: true };
}
