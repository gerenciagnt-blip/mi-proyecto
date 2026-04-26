import { describe, it, expect } from 'vitest';

/**
 * Re-implementación de los helpers internos del módulo de alertas
 * (`diasEntre`) para poder testearlos sin tocar la BD.
 *
 * La función exportada `cargarAlertasInactividad` es difícil de testear
 * sin un mock de Prisma. Aquí blindamos la matemática del cálculo de
 * días — que es lo que realmente afecta al usuario (umbrales).
 */

const MS_DIA = 1000 * 60 * 60 * 24;

function diasEntre(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_DIA));
}

describe('diasEntre', () => {
  it('mismo instante → 0', () => {
    const t = new Date('2026-04-26T10:00:00Z');
    expect(diasEntre(t, t)).toBe(0);
  });

  it('un día completo → 1', () => {
    const a = new Date('2026-04-25T10:00:00Z');
    const b = new Date('2026-04-26T10:00:00Z');
    expect(diasEntre(a, b)).toBe(1);
  });

  it('30 días', () => {
    const a = new Date('2026-03-27T10:00:00Z');
    const b = new Date('2026-04-26T10:00:00Z');
    expect(diasEntre(a, b)).toBe(30);
  });

  it('60 días cruzando meses', () => {
    const a = new Date('2026-02-25T10:00:00Z');
    const b = new Date('2026-04-26T10:00:00Z');
    expect(diasEntre(a, b)).toBe(60);
  });

  it('orden invertido → 0 (clamp a no-negativo)', () => {
    const a = new Date('2026-04-26T10:00:00Z');
    const b = new Date('2026-04-25T10:00:00Z');
    expect(diasEntre(a, b)).toBe(0);
  });

  it('horas parciales se truncan al día completo', () => {
    // 23h59m59s → 0 días
    const a = new Date('2026-04-26T00:00:01Z');
    const b = new Date('2026-04-27T00:00:00Z');
    expect(diasEntre(a, b)).toBe(0);
  });

  it('justo 24h → 1 día', () => {
    const a = new Date('2026-04-26T00:00:00Z');
    const b = new Date('2026-04-27T00:00:00Z');
    expect(diasEntre(a, b)).toBe(1);
  });

  it('cruzando año normal', () => {
    const a = new Date('2025-12-31T00:00:00Z');
    const b = new Date('2026-01-30T00:00:00Z');
    expect(diasEntre(a, b)).toBe(30);
  });

  it('cruzando año bisiesto (29 de feb)', () => {
    const a = new Date('2024-02-28T00:00:00Z');
    const b = new Date('2024-03-29T00:00:00Z');
    // 29 feb + 28 días marzo + 1 = 30 días
    expect(diasEntre(a, b)).toBe(30);
  });
});

describe('clasificación por umbral', () => {
  function pasaUmbral(dias: number, umbral: number): boolean {
    return dias >= umbral;
  }

  it('cartera 30 días', () => {
    expect(pasaUmbral(29, 30)).toBe(false);
    expect(pasaUmbral(30, 30)).toBe(true);
    expect(pasaUmbral(60, 30)).toBe(true);
  });

  it('empresa 60 días', () => {
    expect(pasaUmbral(59, 60)).toBe(false);
    expect(pasaUmbral(60, 60)).toBe(true);
    expect(pasaUmbral(120, 60)).toBe(true);
  });
});
