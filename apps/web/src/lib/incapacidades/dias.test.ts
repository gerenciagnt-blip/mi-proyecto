import { describe, it, expect } from 'vitest';
import { diasIncapacidad, estaCerrada, ESTADOS_CIERRE } from './dias';

/**
 * Tests del cálculo "días desde radicación" para incapacidades.
 *
 * La regla clave (vs cartera) es que el contador NO se resetea con cada
 * gestión — solo se detiene cuando el caso cierra (PAGADA / RECHAZADA).
 */

describe('estaCerrada', () => {
  it('PAGADA y RECHAZADA son cierre', () => {
    expect(estaCerrada('PAGADA')).toBe(true);
    expect(estaCerrada('RECHAZADA')).toBe(true);
  });

  it('RADICADA, EN_REVISION, APROBADA NO son cierre (siguen activos)', () => {
    expect(estaCerrada('RADICADA')).toBe(false);
    expect(estaCerrada('EN_REVISION')).toBe(false);
    // APROBADA es importante: la incapacidad fue aprobada por la entidad
    // pero todavía falta el pago — el caso sigue ABIERTO.
    expect(estaCerrada('APROBADA')).toBe(false);
  });

  it('ESTADOS_CIERRE expone los dos terminales', () => {
    expect(ESTADOS_CIERRE).toEqual(expect.arrayContaining(['PAGADA', 'RECHAZADA']));
    expect(ESTADOS_CIERRE).toHaveLength(2);
  });
});

describe('diasIncapacidad — caso activo', () => {
  it('cuenta días desde radicación hasta hoy si está RADICADA', () => {
    const haceTresDias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const info = diasIncapacidad({
      fechaRadicacion: haceTresDias,
      estado: 'RADICADA',
    });
    expect(info.cerrada).toBe(false);
    // Por ronda al día, debe ser 2 o 3 dependiendo del momento exacto.
    expect(info.dias).toBeGreaterThanOrEqual(2);
    expect(info.dias).toBeLessThanOrEqual(3);
  });

  it('aplica urgencia "fresca" cuando lleva pocos días', () => {
    const ayer = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const info = diasIncapacidad({
      fechaRadicacion: ayer,
      estado: 'EN_REVISION',
    });
    expect(info.urgencia).toBe('fresca');
  });

  it('aplica urgencia "alta" entre 30 y 59 días', () => {
    const hace40dias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const info = diasIncapacidad({
      fechaRadicacion: hace40dias,
      estado: 'EN_REVISION',
    });
    expect(info.urgencia).toBe('alta');
    expect(info.dias).toBeGreaterThanOrEqual(39);
  });

  it('aplica urgencia "critica" cuando lleva 60+ días sin cerrar', () => {
    const hace90dias = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const info = diasIncapacidad({
      fechaRadicacion: hace90dias,
      estado: 'APROBADA', // aprobada pero NO pagada → sigue contando
    });
    expect(info.urgencia).toBe('critica');
    expect(info.cerrada).toBe(false);
  });
});

describe('diasIncapacidad — caso cerrado', () => {
  it('cuenta días entre radicación y cierre cuando está PAGADA', () => {
    const radicacion = new Date(Date.UTC(2026, 3, 1));
    const cierre = new Date(Date.UTC(2026, 3, 16)); // 15 días después
    const info = diasIncapacidad({
      fechaRadicacion: radicacion,
      estado: 'PAGADA',
      fechaCierre: cierre,
    });
    expect(info.cerrada).toBe(true);
    expect(info.dias).toBe(15);
  });

  it('cuenta días entre radicación y cierre cuando está RECHAZADA', () => {
    const radicacion = new Date(Date.UTC(2026, 3, 1));
    const cierre = new Date(Date.UTC(2026, 3, 8)); // 7 días después
    const info = diasIncapacidad({
      fechaRadicacion: radicacion,
      estado: 'RECHAZADA',
      fechaCierre: cierre,
    });
    expect(info.cerrada).toBe(true);
    expect(info.dias).toBe(7);
  });

  it('una incapacidad que cerró hace tiempo conserva sus días originales', () => {
    // Caso típico: el aliado entra hoy y ve una incapacidad PAGADA hace
    // 6 meses. Los días reportados deben seguir siendo los del proceso,
    // no los meses transcurridos desde el cierre hasta hoy.
    const radicacion = new Date(Date.UTC(2025, 9, 1)); // hace mucho
    const cierre = new Date(Date.UTC(2025, 9, 21)); // 20 días después
    const info = diasIncapacidad({
      fechaRadicacion: radicacion,
      estado: 'PAGADA',
      fechaCierre: cierre,
    });
    expect(info.dias).toBe(20);
  });

  it('sin fechaCierre pero estado terminal → fallback a hoy (defensivo)', () => {
    // Si por algún motivo no encontramos la gestión de cierre, no
    // explotamos: contamos hasta hoy.
    const radicacion = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const info = diasIncapacidad({
      fechaRadicacion: radicacion,
      estado: 'PAGADA',
      fechaCierre: null,
    });
    expect(info.cerrada).toBe(true);
    expect(info.dias).toBeGreaterThanOrEqual(4);
    expect(info.dias).toBeLessThanOrEqual(5);
  });
});
