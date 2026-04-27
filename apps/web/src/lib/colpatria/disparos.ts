import { prisma } from '@pila/db';

/**
 * Decide si una afiliación dispara un job al bot Colpatria ARL.
 *
 * Reglas (Sprint 8):
 *   1. Solo modalidad DEPENDIENTE (independientes no van por Colpatria).
 *   2. Solo cuando queda en estado ACTIVA (no INACTIVA).
 *   3. La empresa debe tener `colpatriaActivo=true` (configurado por
 *      ADMIN en `/admin/empresas/[id]/colpatria`).
 *   4. La ARL de la afiliación debe ser Colpatria (matcheamos por
 *      código en EntidadSgss — convención: el código que registró el
 *      operador para Colpatria ARL).
 *   5. Es CREATE (nueva afiliación) o REACTIVACION (estaba INACTIVA
 *      antes y pasó a ACTIVA en este request).
 *
 * Si todas las condiciones se cumplen, devuelve un snapshot listo para
 * persistir en `ColpatriaAfiliacionJob.payload`. Si no, devuelve null.
 *
 * El snapshot incluye TODA la información que el bot necesitará — el
 * worker NO debe hacer joins adicionales contra la BD durante la
 * ejecución (por consistency: si la afiliación cambia entre que se
 * crea el job y se procesa, el bot debe seguir con lo que se capturó
 * al disparo).
 */

/** Códigos de Entidad SGSS que reconocemos como "Colpatria ARL".
 *  Si en el futuro Colpatria cambia código o cambia razón social,
 *  ajustar acá. */
const COLPATRIA_CODIGOS = ['ARL-007', 'COLPATRIA', 'ARL-COLPATRIA'];

export type DisparoColpatriaInput = {
  /** Tipo de operación que se acaba de hacer sobre la afiliación. */
  evento: 'CREAR' | 'REACTIVAR';
  afiliacionId: string;
};

export type ColpatriaPayload = {
  /** Versión del schema del payload — para compat futura si añadimos
   *  o cambiamos campos. */
  schemaVersion: 1;
  evento: 'CREAR' | 'REACTIVAR';
  afiliacion: {
    id: string;
    estado: string;
    modalidad: string;
    nivelRiesgo: string;
    salario: string; // Decimal serializado como string
    fechaIngreso: string; // ISO date
    /** Sprint 8.0.5 — cargo del cotizante (otros valores como
     *  TipoSalario/ModalidadTrabajo/TareaAltoRiesgo van quemados en el bot). */
    cargo: string | null;
    /** Sprint 8.5 — códigos AXA Colpatria de EPS y AFP de la afiliación.
     *  Si la entidad SGSS no tiene `codigoAxa` configurado, queda null
     *  y el bot fallará la validación del submit (job → RETRYABLE). */
    epsCodigoAxa: string | null;
    afpCodigoAxa: string | null;
    /** Datos del cotizante */
    cotizante: {
      id: string;
      tipoDocumento: string;
      numeroDocumento: string;
      primerNombre: string;
      segundoNombre: string | null;
      primerApellido: string;
      segundoApellido: string | null;
      fechaNacimiento: string | null; // ISO date
      genero: string | null;
      /** Sprint 8.0.5 — código AXA 1..5. Null si no se capturó. */
      estadoCivil: string | null;
      email: string | null;
      celular: string | null;
      direccion: string | null;
      /** Nombre del municipio (resuelto desde Municipio.nombre). */
      municipio: string | null;
      departamento: string | null;
    };
    /** Empresa empleadora (Colpatria solo procesa DEPENDIENTE). */
    empresa: {
      id: string;
      nit: string;
      nombre: string;
    };
  };
};

/**
 * Evalúa si el evento dispara un job y, si sí, lo persiste en BD.
 * Retorna el id del job creado o null si no se dispara.
 *
 * No tira excepciones — los errores quedan logueados pero la operación
 * principal (CREATE/UPDATE de la afiliación) NO debe fallar por un
 * problema con el disparo. El operador puede revisar la bitácora.
 */
export async function dispararColpatriaSiAplica(
  input: DisparoColpatriaInput,
): Promise<string | null> {
  try {
    // Cargamos la afiliación con todo lo que necesita el snapshot. Si
    // alguna parte falla (afiliación borrada, etc.), salimos con null.
    const af = await prisma.afiliacion.findUnique({
      where: { id: input.afiliacionId },
      select: {
        id: true,
        estado: true,
        modalidad: true,
        nivelRiesgo: true,
        salario: true,
        fechaIngreso: true,
        cargo: true,
        eps: { select: { codigoAxa: true } },
        afp: { select: { codigoAxa: true } },
        cotizante: {
          select: {
            id: true,
            tipoDocumento: true,
            numeroDocumento: true,
            primerNombre: true,
            segundoNombre: true,
            primerApellido: true,
            segundoApellido: true,
            fechaNacimiento: true,
            genero: true,
            estadoCivil: true,
            email: true,
            celular: true,
            direccion: true,
            municipio: { select: { nombre: true } },
            departamento: { select: { nombre: true } },
          },
        },
        empresa: {
          select: {
            id: true,
            nit: true,
            nombre: true,
            colpatriaActivo: true,
          },
        },
        arl: {
          select: { codigo: true, nombre: true },
        },
      },
    });
    if (!af) return null;

    // Guard #1: modalidad DEPENDIENTE
    if (af.modalidad !== 'DEPENDIENTE') return null;
    // Guard #2: estado ACTIVA (luego del save)
    if (af.estado !== 'ACTIVA') return null;
    // Guard #3: empresa con bot activo
    if (!af.empresa || !af.empresa.colpatriaActivo) return null;
    // Guard #4: ARL = Colpatria
    if (!af.arl) return null;
    const codArl = af.arl.codigo?.toUpperCase().trim();
    const esColpatria =
      COLPATRIA_CODIGOS.some((c) => codArl === c) ||
      af.arl.nombre.toUpperCase().includes('COLPATRIA');
    if (!esColpatria) return null;

    const payload: ColpatriaPayload = {
      schemaVersion: 1,
      evento: input.evento,
      afiliacion: {
        id: af.id,
        estado: af.estado,
        modalidad: af.modalidad,
        nivelRiesgo: af.nivelRiesgo,
        salario: af.salario.toString(),
        fechaIngreso: af.fechaIngreso.toISOString().slice(0, 10),
        cargo: af.cargo,
        epsCodigoAxa: af.eps?.codigoAxa ?? null,
        afpCodigoAxa: af.afp?.codigoAxa ?? null,
        cotizante: {
          id: af.cotizante.id,
          tipoDocumento: af.cotizante.tipoDocumento,
          numeroDocumento: af.cotizante.numeroDocumento,
          primerNombre: af.cotizante.primerNombre,
          segundoNombre: af.cotizante.segundoNombre,
          primerApellido: af.cotizante.primerApellido,
          segundoApellido: af.cotizante.segundoApellido,
          fechaNacimiento: af.cotizante.fechaNacimiento
            ? af.cotizante.fechaNacimiento.toISOString().slice(0, 10)
            : null,
          genero: af.cotizante.genero,
          estadoCivil: af.cotizante.estadoCivil,
          email: af.cotizante.email,
          celular: af.cotizante.celular,
          direccion: af.cotizante.direccion,
          municipio: af.cotizante.municipio?.nombre ?? null,
          departamento: af.cotizante.departamento?.nombre ?? null,
        },
        empresa: {
          id: af.empresa.id,
          nit: af.empresa.nit,
          nombre: af.empresa.nombre,
        },
      },
    };

    const job = await prisma.colpatriaAfiliacionJob.create({
      data: {
        afiliacionId: af.id,
        empresaId: af.empresa.id,
        status: 'PENDING',
        intento: 1,
        // Cast a InputJsonValue: el schema de Prisma para `Json` lo pide.
        // El payload es serializable (solo strings/numbers/null/objects).
        payload: payload as unknown as object,
      },
      select: { id: true },
    });

    return job.id;
  } catch (err) {
    // No queremos que un fallo en el disparo rompa la operación principal
    // (CREATE/UPDATE de la afiliación). Logueamos y devolvemos null.
    console.error('[colpatria/disparos] error al evaluar disparo:', err);
    return null;
  }
}
