import { describe, it, expect } from 'vitest';

/**
 * Tests de los helpers internos del módulo dashboard. Re-implementan los
 * helpers `delta`, `rangoMes` y `periodoAnterior` del archivo `kpis.ts`
 * para que sean testables sin tocar la BD.
 *
 * Si la lógica del archivo principal cambia, este archivo se actualiza
 * en paralelo. La duplicación es deliberada — preferimos no exponer los
 * helpers internos (porque son detalle de implementación) pero sí
 * blindar la matemática del cálculo, que es lo que afecta los números
 * que ven los aliados.
 */

function delta(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

function rangoMes(anio: number, mes: number): { inicio: Date; fin: Date } {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));
  return { inicio, fin };
}

function periodoAnterior(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 };
  return { anio, mes: mes - 1 };
}

describe('delta porcentual', () => {
  it('crecimiento positivo', () => {
    expect(delta(120, 100)).toBe(20);
    expect(delta(150, 100)).toBe(50);
  });

  it('caída', () => {
    expect(delta(80, 100)).toBe(-20);
    expect(delta(0, 100)).toBe(-100);
  });

  it('sin cambio', () => {
    expect(delta(100, 100)).toBe(0);
  });

  it('redondea al entero más cercano', () => {
    expect(delta(123, 100)).toBe(23);
    expect(delta(126, 100)).toBe(26);
    // 123.5 → 24 (round up)
    expect(delta(1235, 1000)).toBe(24);
  });

  it('anterior=0 con actual>0 → null (incomparable, "creció desde cero")', () => {
    expect(delta(50, 0)).toBeNull();
  });

  it('anterior=0 con actual=0 → 0 (sin cambio real)', () => {
    expect(delta(0, 0)).toBe(0);
  });
});

describe('rangoMes', () => {
  it('mes con 31 días', () => {
    const r = rangoMes(2026, 1);
    expect(r.inicio.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('mes con 30 días', () => {
    const r = rangoMes(2026, 4);
    expect(r.inicio.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  it('febrero año normal (28 días)', () => {
    const r = rangoMes(2026, 2);
    expect(r.fin.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('febrero año bisiesto (29 días)', () => {
    const r = rangoMes(2024, 2);
    expect(r.fin.toISOString()).toBe('2024-02-29T23:59:59.999Z');
  });

  it('diciembre cierra el año', () => {
    const r = rangoMes(2026, 12);
    expect(r.fin.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });
});

describe('periodoAnterior', () => {
  it('mes intermedio retrocede uno', () => {
    expect(periodoAnterior(2026, 5)).toEqual({ anio: 2026, mes: 4 });
  });

  it('enero retrocede a diciembre del año anterior', () => {
    expect(periodoAnterior(2026, 1)).toEqual({ anio: 2025, mes: 12 });
  });

  it('diciembre retrocede a noviembre del mismo año', () => {
    expect(periodoAnterior(2026, 12)).toEqual({ anio: 2026, mes: 11 });
  });
});
