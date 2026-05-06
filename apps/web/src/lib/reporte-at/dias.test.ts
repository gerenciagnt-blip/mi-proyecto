import { describe, expect, it } from 'vitest';
import { diaSemanaEs } from './validations';

describe('diaSemanaEs', () => {
  it('mapea domingo correctamente', () => {
    expect(diaSemanaEs(new Date('2026-05-03T12:00:00Z'))).toBe('Domingo');
  });
  it('mapea lunes correctamente', () => {
    expect(diaSemanaEs(new Date('2026-05-04T12:00:00Z'))).toBe('Lunes');
  });
  it('mapea sábado correctamente', () => {
    expect(diaSemanaEs(new Date('2026-05-09T12:00:00Z'))).toBe('Sábado');
  });
});
