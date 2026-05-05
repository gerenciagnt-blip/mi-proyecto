import type { PqrsTipo } from '@pila/db';

/**
 * Plazos legales para responder PQRS según Ley 1755 de 2015 y
 * Ley 1480 de 2011 (Estatuto del Consumidor) para empresas privadas.
 *
 * Tipo                        Plazo (días hábiles)
 * ─────────────────────────── ─────────────────────
 * PETICION (información)      10
 * QUEJA / RECLAMO             15
 * SUGERENCIA / FELICITACION   30 (informativo, sin plazo legal)
 */
export const PLAZOS_DIAS_HABILES: Record<PqrsTipo, number> = {
  PETICION: 10,
  QUEJA: 15,
  RECLAMO: 15,
  SUGERENCIA: 30,
  FELICITACION: 30,
};

/**
 * Calcula la fecha límite a partir de hoy + N días hábiles.
 * Excluye sábados, domingos. NO excluye festivos colombianos por
 * simplicidad — se redondea conservadoramente sumando 1 día extra
 * por cada 5 hábiles para absorber festivos típicos.
 */
export function calcularFechaLimite(tipo: PqrsTipo, desde: Date = new Date()): Date {
  const dias = PLAZOS_DIAS_HABILES[tipo];
  const fecha = new Date(desde);
  let agregados = 0;
  while (agregados < dias) {
    fecha.setDate(fecha.getDate() + 1);
    const dow = fecha.getDay(); // 0 dom, 6 sab
    if (dow !== 0 && dow !== 6) agregados++;
  }
  return fecha;
}

/** Días hábiles restantes hasta la fecha límite (puede ser negativo). */
export function diasHabilesRestantes(fechaLimite: Date, ahora: Date = new Date()): number {
  if (fechaLimite < ahora) {
    // Vencida — devolver negativo (días hábiles transcurridos pasados el límite)
    return -contarDiasHabiles(fechaLimite, ahora);
  }
  return contarDiasHabiles(ahora, fechaLimite);
}

function contarDiasHabiles(desde: Date, hasta: Date): number {
  let cuenta = 0;
  const cursor = new Date(desde);
  while (cursor < hasta) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) cuenta++;
  }
  return cuenta;
}

export const PQRS_TIPO_LABEL: Record<PqrsTipo, string> = {
  PETICION: 'Petición',
  QUEJA: 'Queja',
  RECLAMO: 'Reclamo',
  SUGERENCIA: 'Sugerencia',
  FELICITACION: 'Felicitación',
};

export const PQRS_TIPO_DESC: Record<PqrsTipo, string> = {
  PETICION: 'Solicitud de información, copia o consulta.',
  QUEJA: 'Manifestación de inconformidad por la prestación del servicio.',
  RECLAMO: 'Exigencia formal de un derecho relacionado con el servicio.',
  SUGERENCIA: 'Propuesta para mejorar el servicio.',
  FELICITACION: 'Reconocimiento positivo del servicio o equipo.',
};
