'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pila/db';
import type { TipoEntidadSgss } from '@pila/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { EntidadSgssSchema, TipoEntidadSgssEnum } from '@/lib/validations';
import { nextEntidadSgssCodigo } from '@/lib/consecutivo';
import { parseExcelFile, newImportResult } from '@/lib/excel';
import type { ImportState } from '../_components/import-form';

export type ActionState = { error?: string; ok?: boolean };

function parseTipo(raw: unknown): TipoEntidadSgss | null {
  const parsed = TipoEntidadSgssEnum.safeParse(String(raw ?? '').toUpperCase().trim());
  return parsed.success ? (parsed.data as TipoEntidadSgss) : null;
}

export async function createEntidadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const tipo = parseTipo(formData.get('tipo'));
  if (!tipo) return { error: 'Tipo inválido' };

  const parsed = EntidadSgssSchema.safeParse({
    tipo,
    nombre: String(formData.get('nombre') ?? '').trim(),
    codigoMinSalud: String(formData.get('codigoMinSalud') ?? '').trim(),
    nit: String(formData.get('nit') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const codigo = await nextEntidadSgssCodigo(tipo);

  try {
    await prisma.entidadSgss.create({ data: { ...parsed.data, codigo } });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('Unique')
          ? `Código duplicado (${codigo}) — reintenta`
          : 'Error al crear',
    };
  }

  revalidatePath('/admin/catalogos/entidades');
  return { ok: true };
}

export async function toggleEntidadAction(id: string) {
  await requireAdmin();
  const e = await prisma.entidadSgss.findUnique({ where: { id } });
  if (!e) return;
  await prisma.entidadSgss.update({ where: { id }, data: { active: !e.active } });
  revalidatePath('/admin/catalogos/entidades');
}

export async function importEntidadesAction(
  tipoParam: TipoEntidadSgss,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const tipo = parseTipo(tipoParam);
  if (!tipo) return { error: 'Tipo inválido' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecciona un archivo' };

  let rows: Record<string, unknown>[];
  try {
    rows = await parseExcelFile(file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo leer' };
  }

  const result = newImportResult();
  result.total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawCodigo = String(row.codigo ?? '').toUpperCase().trim();
    const parsed = EntidadSgssSchema.safeParse({
      tipo,
      codigo: rawCodigo,
      nombre: String(row.nombre ?? '').trim(),
      codigoMinSalud: String(row.codigoMinSalud ?? row.minSalud ?? '').trim(),
      nit: String(row.nit ?? '').trim(),
    });
    if (!parsed.success) {
      result.errors.push(`Fila ${i + 2}: ${parsed.error.issues[0]?.message ?? 'inválida'}`);
      result.skipped++;
      continue;
    }

    // Si la fila trae código, hacemos upsert por (tipo, codigo). Sin código, lo
    // auto-generamos y siempre creamos una fila nueva.
    if (parsed.data.codigo) {
      const existing = await prisma.entidadSgss.findUnique({
        where: { tipo_codigo: { tipo, codigo: parsed.data.codigo } },
      });
      if (existing) {
        await prisma.entidadSgss.update({
          where: { id: existing.id },
          data: parsed.data,
        });
        result.updated++;
      } else {
        await prisma.entidadSgss.create({ data: { ...parsed.data, codigo: parsed.data.codigo } });
        result.added++;
      }
    } else {
      const codigo = await nextEntidadSgssCodigo(tipo);
      await prisma.entidadSgss.create({ data: { ...parsed.data, codigo } });
      result.added++;
    }
  }

  revalidatePath('/admin/catalogos/entidades');
  return result;
}
