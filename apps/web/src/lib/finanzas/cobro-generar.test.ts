import { describe, it, expect } from 'vitest';
import { excluirPorRetiroCorto, calcularFechaLimite } from './cobro-generar';

/**
 * Tests de los helpers puros del generador de cobros aliado.
 *
 * Las dos reglas críticas son:
 *   1. Si una afiliación se retira en ≤5 días, NO se cobra mensualidad.
 *   2. La fecha límite del cobro es el día 15 del mes siguiente al período.
 *
 * Si alguna falla, los aliados pueden recibir cobros incorrectos.
 */

describe('excluirPorRetiroCorto', () => {
  const ingreso = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01

  it('sin fecha de retiro → no excluye (afiliación activa cobra normal)', () => {
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: null,
        regimen: 'ORDINARIO',
      }),
    ).toBe(false);
  });

  it('retiro a los 5 días exactos → SÍ excluye (regla "≤5 no cobra")', () => {
    // 1 abril → 6 abril = 5 días exactos
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: new Date(Date.UTC(2026, 3, 6)),
        regimen: 'ORDINARIO',
      }),
    ).toBe(true);
  });

  it('retiro a los 6 días → NO excluye (mínimo cobrable)', () => {
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: new Date(Date.UTC(2026, 3, 7)),
        regimen: 'ORDINARIO',
      }),
    ).toBe(false);
  });

  it('retiro mismo día (0 días) → excluye', () => {
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: ingreso,
        regimen: 'ORDINARIO',
      }),
    ).toBe(true);
  });

  it('retiro a los 30 días → NO excluye', () => {
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: new Date(Date.UTC(2026, 4, 1)),
        regimen: 'ORDINARIO',
      }),
    ).toBe(false);
  });

  it('regla aplica igual para regimen RESOLUCIÓN', () => {
    expect(
      excluirPorRetiroCorto({
        id: 'af1',
        fechaIngreso: ingreso,
        fechaRetiro: new Date(Date.UTC(2026, 3, 4)),
        regimen: 'RESOLUCION',
      }),
    ).toBe(true);
  });
});

describe('calcularFechaLimite', () => {
  it('período abril 2026 → fecha límite 2026-05-15', () => {
    const f = calcularFechaLimite(2026, 4);
    expect(f.getUTCFullYear()).toBe(2026);
    expect(f.getUTCMonth()).toBe(4); // 0-indexed: 4 = mayo
    expect(f.getUTCDate()).toBe(15);
    // 23:59:59 UTC → día completo en Bogotá (UTC-5)
    expect(f.getUTCHours()).toBe(23);
    expect(f.getUTCMinutes()).toBe(59);
    expect(f.getUTCSeconds()).toBe(59);
  });

  it('diciembre 2026 → enero 2027 (rollover de año)', () => {
    const f = calcularFechaLimite(2026, 12);
    expect(f.getUTCFullYear()).toBe(2027);
    expect(f.getUTCMonth()).toBe(0); // enero
    expect(f.getUTCDate()).toBe(15);
  });

  it('enero 2026 → 2026-02-15', () => {
    const f = calcularFechaLimite(2026, 1);
    expect(f.toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  it('febrero (mes corto) sigue rolando bien', () => {
    const f = calcularFechaLimite(2026, 2);
    expect(f.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('noviembre → diciembre 15', () => {
    const f = calcularFechaLimite(2026, 11);
    expect(f.toISOString().slice(0, 10)).toBe('2026-12-15');
  });
});
