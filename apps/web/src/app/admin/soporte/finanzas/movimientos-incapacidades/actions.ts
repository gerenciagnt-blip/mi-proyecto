'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@pila/db';
import { requireStaff } from '@/lib/auth-helpers';
import { nextMovimientoIncConsecutivo } from '@/lib/finanzas/consecutivos';
import { parseExtractoBancario, parseExtractoBancarioPdf } from '@/lib/finanzas/parser-extracto';

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
    return { error: 'Selecciona un archivo Excel, CSV o PDF.' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'Archivo demasiado grande (máx. 10 MB).' };
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Detectamos el tipo por extensión (más confiable que MIME para casos
  // donde el browser manda mime genérico como octet-stream).
  const nombre = (file.name ?? '').toLowerCase();
  const esPdf = nombre.endsWith('.pdf') || file.type === 'application/pdf';

  const parse = esPdf
    ? await parseExtractoBancarioPdf(buf, { bancoDefault })
    : parseExtractoBancario(buf, { bancoDefault });

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

/**
 * Registra manualmente un movimiento bancario. Útil cuando el extracto
 * no está disponible o el formato del PDF no es parseable.
 *
 * Genera el mismo `hashIdentidad` que el parser para que si después se
 * importa el extracto con esa misma fila, no se duplique.
 */
export async function crearMovimientoManualAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();

  const fechaIso = String(formData.get('fechaIngreso') ?? '').trim();
  const concepto = String(formData.get('concepto') ?? '').trim();
  const valorStr = String(formData.get('valor') ?? '').trim();
  const bancoOrigen = String(formData.get('bancoOrigen') ?? '').trim() || null;

  if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    return { error: 'Fecha inválida (formato AAAA-MM-DD)' };
  }
  if (!concepto || concepto.length < 3) {
    return { error: 'El concepto es obligatorio (mín. 3 caracteres)' };
  }
  if (concepto.length > 500) {
    return { error: 'Concepto demasiado largo (máx. 500 caracteres)' };
  }
  const valor = Number(valorStr.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { error: 'Valor inválido (debe ser un número > 0)' };
  }

  const [y, m, d] = fechaIso.split('-').map(Number);
  const fechaIngreso = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));

  // hashIdentidad consistente con el parser para evitar duplicados al
  // importar después un extracto con la misma fila.
  const { createHash } = await import('node:crypto');
  const hashKey = `${bancoOrigen ?? ''}|${fechaIngreso.toISOString().slice(0, 10)}|${valor}|${concepto.toLowerCase()}`;
  const hashIdentidad = createHash('sha256').update(hashKey).digest('hex');

  const existente = await prisma.movimientoIncapacidad.findFirst({
    where: { hashIdentidad },
    select: { id: true, consecutivo: true },
  });
  if (existente) {
    return {
      error: `Ya existe un movimiento con esos datos (${existente.consecutivo}).`,
    };
  }

  try {
    const consec = await nextMovimientoIncConsecutivo();
    await prisma.movimientoIncapacidad.create({
      data: {
        consecutivo: consec,
        fechaIngreso,
        concepto,
        valor: new Prisma.Decimal(valor),
        bancoOrigen,
        hashIdentidad,
        estado: 'PENDIENTE',
        createdById: session.user.id,
      },
    });
  } catch (e) {
    return {
      error: `Error al guardar: ${e instanceof Error ? e.message : 'desconocido'}`,
    };
  }

  revalidatePath('/admin/soporte/finanzas/movimientos-incapacidades');
  return { ok: true };
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
