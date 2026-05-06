/**
 * Storage del bot Colpatria — guarda los PDFs de comprobante de
 * afiliación que el portal AXA devuelve tras un submit exitoso.
 *
 * Reusa la misma raíz `UPLOADS_DIR` que el web app, así el endpoint
 * `/api/colpatria/jobs/[id]/pdf` (Next.js) puede leer los archivos
 * sin storage compartido extra. En dev local default `./uploads/`,
 * en DigitalOcean apunta a un volumen montado.
 *
 * Estructura: `<UPLOADS_DIR>/colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`
 *
 * Cuando migremos a S3/R2 reemplazamos solo este módulo.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, access, unlink, constants as fsConstants } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { createLogger } from './logger.js';
import { captureMessage } from './sentry.js';

const log = createLogger('storage');

function uploadsRoot(): string {
  // Si el bot corre en GH Actions / DigitalOcean, UPLOADS_DIR debe
  // apuntar al mismo path que monta el web app. En local, por default
  // `./uploads/` resuelve relativo al cwd del proceso (raíz del repo
  // cuando se invoca con `pnpm bot-colpatria ...`).
  return resolve(process.env.UPLOADS_DIR ?? './uploads');
}

/**
 * Valida que `UPLOADS_DIR` apunte a un volumen persistente — y NO al
 * filesystem efímero del runner de GH Actions.
 *
 * Por qué importa: el bot guarda PDFs de comprobante en este path. Si el
 * path es efímero, los PDFs se borran cuando el runner se apaga (al
 * final de cada job). El TTL de 3 días que implementa `limpiar-pdfs.ts`
 * pierde sentido — los archivos ya no están.
 *
 * Síntomas detectables sin esta validación:
 *   - `pdfPath` en BD apunta a archivo inexistente.
 *   - El endpoint `/api/colpatria/jobs/[id]/pdf` devuelve 404 silencioso.
 *   - El operador descubre el problema por reclamos de aliados.
 *
 * Heurística:
 *   1. Si `UPLOADS_DIR` está vacío o es default `./uploads`, el path
 *      será relativo al cwd → en GH Actions es la copia del repo, efímera.
 *   2. En GH Actions detectamos por `process.env.GITHUB_ACTIONS === 'true'`.
 *   3. Paths como `/tmp/`, `${RUNNER_TEMP}`, `/home/runner/work/...`
 *      son efímeros en GH Actions runners.
 *
 * Devuelve: `{ ok, warnings, errors }`. Si hay errores, el caller decide
 * si abortar o seguir con riesgo.
 */
export async function validarUploadsDir(): Promise<{
  ok: boolean;
  path: string;
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const raw = process.env.UPLOADS_DIR;
  const resolved = uploadsRoot();
  const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

  // 1. Path no seteado
  if (!raw) {
    warnings.push(
      `UPLOADS_DIR no está seteado — usando default "./uploads" (cwd=${process.cwd()}). ` +
        'En producción debería ser un path absoluto a un volumen persistente.',
    );
  } else if (!isAbsolute(raw)) {
    warnings.push(
      `UPLOADS_DIR es relativo ("${raw}"). En producción debería ser absoluto ` +
        '(ej: "/data/uploads" o "C:/uploads") para que web y bot lo resuelvan al mismo lugar.',
    );
  }

  // 2. En CI, paths efímeros conocidos
  if (isCI) {
    const efimeros = ['/tmp', '/home/runner/work', '/home/runner/_work'];
    const matchEfimero = efimeros.find((e) => resolved.startsWith(e));
    if (matchEfimero) {
      errors.push(
        `UPLOADS_DIR ("${resolved}") está en filesystem efímero del runner GH Actions ` +
          `(detectado prefijo "${matchEfimero}"). Los PDFs se BORRAN al terminar el job. ` +
          'Configurar UPLOADS_DIR a un volumen persistente (S3/R2 backend, montaje de DigitalOcean, etc).',
      );
    }
    if (!process.env.UPLOADS_DIR) {
      errors.push(
        'UPLOADS_DIR no seteado en GH Actions. Default "./uploads" es relativo al checkout del repo y se borra al terminar el job. ' +
          'Configurar como secret + agregar al workflow YAML.',
      );
    }
  }

  // 3. ¿Existe y es writable?
  try {
    await mkdir(resolved, { recursive: true });
    await access(resolved, fsConstants.W_OK);
  } catch (err) {
    errors.push(
      `UPLOADS_DIR ("${resolved}") no es writable: ${err instanceof Error ? err.message : err}`,
    );
  }

  const ok = errors.length === 0;
  return { ok, path: resolved, warnings, errors };
}

/**
 * Wrapper sobre `validarUploadsDir` que loguea + manda alertas Sentry.
 * Llamarlo al inicio de cada comando del bot que persiste archivos
 * (procesar, eventualmente cualquier otro). NO aborta el bot — solo
 * deja registro para que el operador pueda reaccionar.
 *
 * Si algún día querés hacerlo bloqueante (recomendado en prod),
 * cambiar el return tipo y `process.exit(1)` en errores.
 */
export async function validarUploadsDirOAlertar(): Promise<void> {
  const r = await validarUploadsDir();

  if (r.warnings.length > 0) {
    log.warn(
      { uploadsDir: r.path, warnings: r.warnings },
      'UPLOADS_DIR · warnings de configuración',
    );
  }
  if (r.errors.length > 0) {
    // Logueamos como ERROR → va a Sentry vía hook del logger.
    log.error(
      { uploadsDir: r.path, errors: r.errors, warnings: r.warnings },
      'UPLOADS_DIR · errores de configuración (PDFs en riesgo)',
    );
    // Mensaje explícito a Sentry con contexto rico para que el operador
    // pueda diagnosticar sin entrar al log JSON.
    await captureMessage(`UPLOADS_DIR mal configurado: ${r.errors[0]}`, 'error', {
      uploadsDir: r.path,
      errors: r.errors,
      warnings: r.warnings,
      cwd: process.cwd(),
      ci: process.env.GITHUB_ACTIONS === 'true',
    });
  } else if (r.warnings.length === 0) {
    log.info({ uploadsDir: r.path }, 'UPLOADS_DIR · OK');
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Guarda el PDF del comprobante AXA y devuelve la ruta relativa al
 * UPLOADS_DIR (lo que se persiste en `ColpatriaAfiliacionJob.pdfPath`).
 *
 * Path relativo: `colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`
 *
 * El `jobId` en el filename garantiza unicidad incluso si el mismo
 * empleado se reintenta varias veces. El `hash12` es para detectar
 * duplicados o corrupciones (mismo PDF re-guardado da mismo hash).
 */
export async function guardarPdfComprobante(
  pdf: Buffer,
  empresaId: string,
  jobId: string,
): Promise<{ path: string; hash: string; size: number }> {
  if (pdf.byteLength === 0) {
    throw new Error('PDF vacío — se rechaza para no guardar artefacto inútil');
  }

  const hash = sha256(pdf);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const relDir = join('colpatria', empresaId, ym);
  const absDir = join(uploadsRoot(), relDir);
  await mkdir(absDir, { recursive: true });

  const filename = `${jobId}-${hash.slice(0, 12)}.pdf`;
  const absPath = join(absDir, filename);
  await writeFile(absPath, pdf);

  // Path relativo SIEMPRE con `/` (compat Windows ↔ Linux), porque
  // este string viaja a BD y se concatena después con uploadsRoot()
  // en la API de Next.
  const relPath = join(relDir, filename).replace(/\\/g, '/');
  return { path: relPath, hash, size: pdf.byteLength };
}

/**
 * Sprint 8.6 — Guarda el PDF del certificado de afiliación vigente.
 *
 * Path relativo: `colpatria/<empresaId>/certificados/<jobId>-<hash12>.pdf`
 *
 * Sin partición por mes porque NO hay retención: el archivo se borra
 * apenas el endpoint lo sirve al usuario. Mientras tanto vive en una
 * carpeta dedicada para no mezclarse con los comprobantes.
 */
export async function guardarPdfCertificado(
  pdf: Buffer,
  empresaId: string,
  jobId: string,
): Promise<{ path: string; hash: string; size: number }> {
  if (pdf.byteLength === 0) {
    throw new Error('PDF vacío — se rechaza para no guardar artefacto inútil');
  }
  const hash = sha256(pdf);
  const relDir = join('colpatria', empresaId, 'certificados');
  const absDir = join(uploadsRoot(), relDir);
  await mkdir(absDir, { recursive: true });

  const filename = `${jobId}-${hash.slice(0, 12)}.pdf`;
  const absPath = join(absDir, filename);
  await writeFile(absPath, pdf);

  const relPath = join(relDir, filename).replace(/\\/g, '/');
  return { path: relPath, hash, size: pdf.byteLength };
}

/**
 * Borra un PDF del filesystem dado el path relativo persistido en BD.
 * Idempotente: si el archivo ya no existe, no tira (logueamos warn).
 *
 * Usado por el endpoint que sirve el certificado al usuario:
 * lee + sirve + borra + marca `entregadoAt` en el job.
 */
export async function borrarPdfRelativo(relPath: string): Promise<void> {
  const abs = join(uploadsRoot(), relPath);
  try {
    await unlink(abs);
  } catch (err) {
    log.warn(
      { path: abs, err: err instanceof Error ? err.message : err },
      'unlink falló — quizás el archivo ya no existe',
    );
  }
}
