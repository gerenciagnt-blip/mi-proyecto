'use server';

import { revalidatePath } from 'next/cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@pila/db';
import { requireAuth } from '@/lib/auth-helpers';

export type ActionState = { error?: string; ok?: boolean };

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const TextSchema = z.object({
  nombre: z.string().trim().min(1, 'Requerido').max(200),
  encabezado: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  pieDePagina: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

async function deleteLocalFileIfExists(publicPath: string | null | undefined) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const abs = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
  await fs.unlink(abs).catch(() => {
    /* ignore: file may not exist */
  });
}

async function saveLogoFile(sucursalId: string, file: File): Promise<string> {
  const ext = EXT_BY_MIME[file.type] ?? 'bin';
  const suffix = randomBytes(4).toString('hex');
  const filename = `${sucursalId}-${Date.now()}-${suffix}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'comprobantes');
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return `/uploads/comprobantes/${filename}`;
}

export async function saveComprobanteAction(
  sucursalId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const parsed = TextSchema.safeParse({
    nombre: String(formData.get('nombre') ?? '').trim(),
    encabezado: String(formData.get('encabezado') ?? '').trim(),
    pieDePagina: String(formData.get('pieDePagina') ?? '').trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
  if (!sucursal) return { error: 'Sucursal no encontrada' };

  // Current state
  const existing = await prisma.comprobanteFormato.findUnique({ where: { sucursalId } });

  // Handle logo upload (opcional)
  let logoUrlUpdate: { logoUrl?: string } = {};
  const logo = formData.get('logo');
  const removeLogo = formData.get('removeLogo') === 'on';

  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return { error: 'Logo mayor a 2 MB' };
    if (!ALLOWED_MIME.has(logo.type)) {
      return { error: 'Formato no permitido (usa PNG, JPG, WEBP o SVG)' };
    }
    const newUrl = await saveLogoFile(sucursalId, logo);
    await deleteLocalFileIfExists(existing?.logoUrl);
    logoUrlUpdate = { logoUrl: newUrl };
  } else if (removeLogo && existing?.logoUrl) {
    await deleteLocalFileIfExists(existing.logoUrl);
    logoUrlUpdate = { logoUrl: undefined };
  }

  try {
    await prisma.comprobanteFormato.upsert({
      where: { sucursalId },
      create: {
        sucursalId,
        ...parsed.data,
        ...('logoUrl' in logoUrlUpdate ? { logoUrl: logoUrlUpdate.logoUrl } : {}),
      },
      update: {
        ...parsed.data,
        ...('logoUrl' in logoUrlUpdate
          ? { logoUrl: logoUrlUpdate.logoUrl ?? null }
          : {}),
      },
    });
  } catch {
    return { error: 'Error al guardar' };
  }

  revalidatePath('/admin/catalogos/comprobantes');
  revalidatePath(`/admin/catalogos/comprobantes/${sucursalId}`);
  return { ok: true };
}

export async function toggleComprobanteAction(sucursalId: string) {
  await requireAuth();
  const f = await prisma.comprobanteFormato.findUnique({ where: { sucursalId } });
  if (!f) return;
  await prisma.comprobanteFormato.update({
    where: { sucursalId },
    data: { active: !f.active },
  });
  revalidatePath('/admin/catalogos/comprobantes');
  revalidatePath(`/admin/catalogos/comprobantes/${sucursalId}`);
}
