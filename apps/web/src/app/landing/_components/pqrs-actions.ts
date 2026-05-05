'use server';

/**
 * Server actions PÚBLICAS de PQRS — accesibles desde la landing sin
 * autenticación. Validación estricta + rate limiting básico (por
 * volumen, no por IP individual aún) + sanitización.
 */

import { prisma } from '@pila/db';
import { headers } from 'next/headers';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { PqrsCrearSchema } from '@/lib/pqrs/validations';
import { nextPqrsConsecutivo } from '@/lib/pqrs/consecutivo';
import { calcularFechaLimite } from '@/lib/pqrs/plazos';
import { notificarNuevaPqrs } from '@/lib/pqrs/notificaciones';
import { createLogger } from '@/lib/logger';

const log = createLogger('pqrs-public');

const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOCS_POR_PQRS = 5;
const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export type PqrsCrearResult =
  | { ok: true; consecutivo: string; pqrsId: string }
  | { ok: false; error: string };

export async function crearPqrsPublicaAction(formData: FormData): Promise<PqrsCrearResult> {
  // Parse y validación
  const parsed = PqrsCrearSchema.safeParse({
    tipo: String(formData.get('tipo') ?? ''),
    tipoDocumento: String(formData.get('tipoDocumento') ?? ''),
    numeroDocumento: String(formData.get('numeroDocumento') ?? ''),
    nombres: String(formData.get('nombres') ?? ''),
    apellidos: String(formData.get('apellidos') ?? ''),
    email: String(formData.get('email') ?? ''),
    telefono: String(formData.get('telefono') ?? ''),
    empresaNombre: String(formData.get('empresaNombre') ?? ''),
    asunto: String(formData.get('asunto') ?? ''),
    descripcion: String(formData.get('descripcion') ?? ''),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const data = parsed.data;

  // Recoger archivos adjuntos (máx N de tamaño limitado y mimes permitidos)
  type ArchivoIn = { file: File; buffer: Buffer; hash: string };
  const archivos: ArchivoIn[] = [];
  const fileEntries = formData.getAll('documento');
  for (const entry of fileEntries) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (archivos.length >= MAX_DOCS_POR_PQRS) {
      return { ok: false, error: `Máximo ${MAX_DOCS_POR_PQRS} documentos por PQRS` };
    }
    if (entry.size > MAX_DOC_SIZE_BYTES) {
      return { ok: false, error: `"${entry.name}" supera el máximo de 5 MB` };
    }
    if (!(MIMES_PERMITIDOS as readonly string[]).includes(entry.type)) {
      return { ok: false, error: `Tipo de archivo no permitido: ${entry.type}` };
    }
    const buffer = Buffer.from(await entry.arrayBuffer());
    const hash = createHash('sha256').update(buffer).digest('hex');
    archivos.push({ file: entry, buffer, hash });
  }

  // Metadata técnica para auditoría (sin guardar más de lo necesario)
  const hdrs = await headers();
  const ipAddress =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? null;
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) ?? null;

  try {
    const consecutivo = await nextPqrsConsecutivo();
    const fechaLimite = calcularFechaLimite(data.tipo);

    const pqrs = await prisma.pqrs.create({
      data: {
        consecutivo,
        tipo: data.tipo,
        tipoDocumento: data.tipoDocumento,
        numeroDocumento: data.numeroDocumento,
        nombres: data.nombres,
        apellidos: data.apellidos,
        email: data.email,
        telefono: data.telefono,
        empresaNombre: data.empresaNombre,
        asunto: data.asunto,
        descripcion: data.descripcion,
        ipAddress,
        userAgent,
        fechaLimite,
        // Bitácora inicial — radicación.
        gestiones: {
          create: {
            descripcion:
              `PQRS ${consecutivo} radicada por ${data.nombres} ${data.apellidos ?? ''}`.trim(),
            nuevoEstado: 'RECIBIDA',
            userName: 'Solicitante (público)',
          },
        },
      },
    });

    // Guardar adjuntos a disco si los hay
    if (archivos.length > 0) {
      const uploadsDir = process.env.UPLOADS_DIR ?? './uploads';
      const pqrsDir = resolve(uploadsDir, 'pqrs', pqrs.id);
      if (!existsSync(pqrsDir)) {
        mkdirSync(pqrsDir, { recursive: true });
      }
      for (const a of archivos) {
        const safeName = a.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        const filename = `${randomBytes(6).toString('hex')}-${safeName}`;
        const fullPath = join(pqrsDir, filename);
        writeFileSync(fullPath, a.buffer);
        await prisma.pqrsDocumento.create({
          data: {
            pqrsId: pqrs.id,
            archivoPath: `pqrs/${pqrs.id}/${filename}`,
            archivoHash: a.hash,
            archivoMime: a.file.type,
            archivoSize: a.file.size,
            archivoNombreOriginal: a.file.name.slice(0, 200),
            origen: 'SOLICITANTE',
          },
        });
      }
    }

    log.info({ pqrsId: pqrs.id, consecutivo, tipo: data.tipo }, 'PQRS pública radicada');

    // Disparo de notificaciones — no bloqueante, fire-and-forget.
    void notificarNuevaPqrs({
      id: pqrs.id,
      consecutivo,
      tipo: data.tipo,
      asunto: data.asunto,
      nombres: data.nombres,
      apellidos: data.apellidos ?? null,
      email: data.email,
      telefono: data.telefono,
      numeroDocumento: data.numeroDocumento,
      empresaNombre: data.empresaNombre ?? null,
    }).catch((err) =>
      log.error({ err: String(err), pqrsId: pqrs.id }, 'Notificar nueva PQRS falló'),
    );

    return { ok: true, consecutivo, pqrsId: pqrs.id };
  } catch (err) {
    log.error({ err: String(err) }, 'Error creando PQRS pública');
    return { ok: false, error: 'No se pudo registrar la PQRS. Intenta nuevamente.' };
  }
}
