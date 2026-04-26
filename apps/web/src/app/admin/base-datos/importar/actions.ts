'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getUserScope } from '@/lib/sucursal-scope';
import {
  filaToPrismaPayload,
  parsePlantillaCotizantes,
  type ImportPreview,
} from '@/lib/cotizantes/csv-import';

export type PreviewState = {
  error?: string;
  preview?: ImportPreview & {
    /** Cuántos de los válidos ya existen en BD (se skipearán al confirmar). */
    yaExistentes: number;
  };
};

export type ImportarState = {
  error?: string;
  ok?: boolean;
  resultado?: {
    creados: number;
    omitidosPorYaExistir: number;
    erroresAlCrear: number;
  };
};

const TAMANO_MAX = 5 * 1024 * 1024; // 5 MB

/**
 * Lee el archivo y devuelve preview SIN persistir. Marca cuáles de los
 * registros válidos ya existen en BD (mismo tipoDoc + numeroDoc en la
 * sucursal del aliado) — esos se skipean al confirmar.
 */
export async function previewImportarCotizantesAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo CSV o Excel.' };
  }
  if (file.size > TAMANO_MAX) {
    return { error: 'Archivo demasiado grande (máx. 5 MB).' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parsePlantillaCotizantes(buf);

  if (!parsed.ok) {
    return { error: parsed.errores[0] ?? 'No se pudo parsear el archivo.' };
  }

  // Buscar cuántos válidos ya existen en BD para informar al usuario.
  const sucursalIdScope = scope.tipo === 'SUCURSAL' ? scope.sucursalId : null;
  let yaExistentes = 0;
  if (parsed.validas.length > 0) {
    const condiciones = parsed.validas.map((v) => ({
      tipoDocumento: v.tipoDocumento,
      numeroDocumento: v.numeroDocumento,
      // Si el aliado importa, scoped a su sucursal. Si es staff, busca
      // global porque puede crear cotizantes sin sucursal.
      ...(sucursalIdScope ? { sucursalId: sucursalIdScope } : {}),
    }));
    yaExistentes = await prisma.cotizante.count({
      where: { OR: condiciones },
    });
  }

  return {
    preview: {
      ...parsed,
      yaExistentes,
    },
  };
}

/**
 * Confirma el import: re-parsea el archivo y crea los cotizantes en BD
 * dentro de una transacción. Skipea los que ya existen (idempotente).
 *
 * El usuario debió ver primero el preview — esta action no devuelve los
 * detalles de validación, solo el conteo.
 */
export async function importarCotizantesAction(
  _prev: ImportarState,
  formData: FormData,
): Promise<ImportarState> {
  await requireAuth();
  const scope = await getUserScope();
  if (!scope) return { error: 'Sesión inválida' };

  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona un archivo CSV o Excel.' };
  }
  if (file.size > TAMANO_MAX) {
    return { error: 'Archivo demasiado grande (máx. 5 MB).' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parsePlantillaCotizantes(buf);
  if (!parsed.ok) {
    return { error: parsed.errores[0] ?? 'No se pudo parsear el archivo.' };
  }

  const sucursalId = scope.tipo === 'SUCURSAL' ? scope.sucursalId : null;

  // Pre-cargamos los existentes para hacer el filtro en JS y evitar
  // create() individual por cada uno (más rápido + transacción más corta).
  const existentes = await prisma.cotizante.findMany({
    where: {
      OR: parsed.validas.map((v) => ({
        tipoDocumento: v.tipoDocumento,
        numeroDocumento: v.numeroDocumento,
        ...(sucursalId ? { sucursalId } : {}),
      })),
    },
    select: { tipoDocumento: true, numeroDocumento: true },
  });
  const existenSet = new Set(existentes.map((e) => `${e.tipoDocumento}|${e.numeroDocumento}`));

  const aCrear = parsed.validas.filter(
    (v) => !existenSet.has(`${v.tipoDocumento}|${v.numeroDocumento}`),
  );
  const omitidosPorYaExistir = parsed.validas.length - aCrear.length;

  if (aCrear.length === 0) {
    return {
      ok: true,
      resultado: { creados: 0, omitidosPorYaExistir, erroresAlCrear: 0 },
    };
  }

  // Bulk create en transacción. Si alguna falla, rollback completo —
  // así el usuario puede corregir y reintentar sin estado inconsistente.
  let erroresAlCrear = 0;
  try {
    await prisma.cotizante.createMany({
      data: aCrear.map((v) => filaToPrismaPayload(v, sucursalId)),
      skipDuplicates: true,
    });
  } catch (e) {
    // Si createMany falla por algún motivo extraño, intentamos uno a uno
    // para que el usuario vea cuántos se salvaron.
    erroresAlCrear = 0;
    let creadosIndividual = 0;
    for (const v of aCrear) {
      try {
        await prisma.cotizante.create({
          data: filaToPrismaPayload(v, sucursalId),
        });
        creadosIndividual++;
      } catch {
        erroresAlCrear++;
      }
    }
    revalidatePath('/admin/base-datos');
    return {
      ok: erroresAlCrear < aCrear.length,
      resultado: {
        creados: creadosIndividual,
        omitidosPorYaExistir,
        erroresAlCrear,
      },
      ...(erroresAlCrear === aCrear.length
        ? {
            error: `No se pudo crear ningún cotizante: ${e instanceof Error ? e.message : 'error'}`,
          }
        : {}),
    };
  }

  revalidatePath('/admin/base-datos');
  return {
    ok: true,
    resultado: { creados: aCrear.length, omitidosPorYaExistir, erroresAlCrear: 0 },
  };
}
