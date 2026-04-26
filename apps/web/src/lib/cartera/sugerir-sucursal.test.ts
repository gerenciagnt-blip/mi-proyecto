import { describe, it, expect } from 'vitest';
import {
  mejorSucursalSugerida,
  clasificarConfianza,
  type LineaHistorica,
} from './sugerir-sucursal';

/**
 * Tests de la lógica pure-function. La parte que toca BD
 * (`sugerirSucursalParaDoc`, `sugerirSucursalesBatch`) requiere mockear
 * Prisma — preferimos blindar la matemática del ranking, que es lo que
 * decide qué sucursal se sugiere.
 */

const FECHA = (iso: string) => new Date(iso);

describe('mejorSucursalSugerida', () => {
  it('vacío → null', () => {
    expect(mejorSucursalSugerida([])).toBeNull();
  });

  it('todas sin sucursalAsignadaId → null', () => {
    const h: LineaHistorica[] = [
      { sucursalAsignadaId: null, createdAt: FECHA('2026-01-01') },
      { sucursalAsignadaId: null, createdAt: FECHA('2026-02-01') },
    ];
    expect(mejorSucursalSugerida(h)).toBeNull();
  });

  it('una sola línea con sucursal → esa sucursal', () => {
    const h: LineaHistorica[] = [{ sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-01-01') }];
    const r = mejorSucursalSugerida(h);
    expect(r).toEqual({
      sucursalId: 'suc1',
      ocurrencias: 1,
      total: 1,
      ultimaAsignacion: FECHA('2026-01-01'),
    });
  });

  it('mayoría clara → gana', () => {
    const h: LineaHistorica[] = [
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-01-01') },
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-02-01') },
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-03-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-04-01') },
    ];
    const r = mejorSucursalSugerida(h);
    expect(r?.sucursalId).toBe('suc1');
    expect(r?.ocurrencias).toBe(3);
    expect(r?.total).toBe(4);
  });

  it('empate → gana la asignación más reciente', () => {
    const h: LineaHistorica[] = [
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-01-01') },
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-01-15') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-02-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-03-01') },
    ];
    const r = mejorSucursalSugerida(h);
    expect(r?.sucursalId).toBe('suc2');
    expect(r?.ocurrencias).toBe(2);
    expect(r?.ultimaAsignacion).toEqual(FECHA('2026-03-01'));
  });

  it('mezcla con nulls → solo cuentan los con sucursal', () => {
    const h: LineaHistorica[] = [
      { sucursalAsignadaId: null, createdAt: FECHA('2026-01-01') },
      { sucursalAsignadaId: null, createdAt: FECHA('2026-02-01') },
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-03-01') },
    ];
    const r = mejorSucursalSugerida(h);
    expect(r?.sucursalId).toBe('suc1');
    expect(r?.ocurrencias).toBe(1);
    expect(r?.total).toBe(1); // solo cuenta las con sucursal
  });

  it('tres sucursales con conteos distintos → mayor gana', () => {
    const h: LineaHistorica[] = [
      { sucursalAsignadaId: 'suc1', createdAt: FECHA('2026-01-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-02-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-03-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-04-01') },
      { sucursalAsignadaId: 'suc2', createdAt: FECHA('2026-05-01') },
      { sucursalAsignadaId: 'suc3', createdAt: FECHA('2026-06-01') },
    ];
    const r = mejorSucursalSugerida(h);
    expect(r?.sucursalId).toBe('suc2');
    expect(r?.ocurrencias).toBe(4);
    expect(r?.total).toBe(6);
  });
});

describe('clasificarConfianza', () => {
  it('total=0 → BAJA', () => {
    expect(clasificarConfianza(0, 0)).toBe('BAJA');
  });

  it('100% → ALTA', () => {
    expect(clasificarConfianza(5, 5)).toBe('ALTA');
  });

  it('80% exacto → ALTA', () => {
    expect(clasificarConfianza(8, 10)).toBe('ALTA');
  });

  it('79% → MEDIA', () => {
    // 79/100 = 0.79 < 0.8
    expect(clasificarConfianza(79, 100)).toBe('MEDIA');
  });

  it('50% exacto → MEDIA', () => {
    expect(clasificarConfianza(5, 10)).toBe('MEDIA');
  });

  it('49% → BAJA', () => {
    expect(clasificarConfianza(49, 100)).toBe('BAJA');
  });

  it('1 de 1 → ALTA', () => {
    expect(clasificarConfianza(1, 1)).toBe('ALTA');
  });

  it('1 de 3 → BAJA', () => {
    expect(clasificarConfianza(1, 3)).toBe('BAJA');
  });
});
