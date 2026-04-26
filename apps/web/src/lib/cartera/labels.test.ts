import { describe, it, expect } from 'vitest';
import { diasEntre, clasificarUrgencia } from './labels';

/**
 * Tests del helper "días sin gestión" — la lógica de priorización de
 * cartera. Si esto se rompe, las cartelas críticas (60+ días) podrían
 * quedar mal etiquetadas y el soporte priorizar mal.
 */

describe('diasEntre', () => {
  const base = new Date(Date.UTC(2026, 3, 25, 12, 0, 0)); // 2026-04-25 12:00 UTC

  it('mismo día → 0 días', () => {
    expect(diasEntre(base, base)).toBe(0);
  });

  it('un día completo de diferencia', () => {
    const ayer = new Date(Date.UTC(2026, 3, 24, 12, 0, 0));
    expect(diasEntre(ayer, base)).toBe(1);
  });

  it('30 días', () => {
    const haceMes = new Date(Date.UTC(2026, 2, 26, 12, 0, 0));
    expect(diasEntre(haceMes, base)).toBe(30);
  });

  it('fechas en el futuro → 0 (defensivo, nunca debería pasar)', () => {
    const futuro = new Date(Date.UTC(2026, 4, 1, 12, 0, 0));
    expect(diasEntre(futuro, base)).toBe(0);
  });

  it('diferencia parcial de horas no cuenta como día completo', () => {
    // Misma fecha calendaria, solo unas horas de diferencia → 0 días
    const pocasHoras = new Date(Date.UTC(2026, 3, 25, 6, 0, 0));
    expect(diasEntre(pocasHoras, base)).toBe(0);
  });
});

describe('clasificarUrgencia', () => {
  it('< 7 días → fresca', () => {
    expect(clasificarUrgencia(0)).toBe('fresca');
    expect(clasificarUrgencia(3)).toBe('fresca');
    expect(clasificarUrgencia(6)).toBe('fresca');
  });

  it('7-29 días → media', () => {
    expect(clasificarUrgencia(7)).toBe('media');
    expect(clasificarUrgencia(15)).toBe('media');
    expect(clasificarUrgencia(29)).toBe('media');
  });

  it('30-59 días → alta', () => {
    expect(clasificarUrgencia(30)).toBe('alta');
    expect(clasificarUrgencia(45)).toBe('alta');
    expect(clasificarUrgencia(59)).toBe('alta');
  });

  it('60+ días → crítica', () => {
    expect(clasificarUrgencia(60)).toBe('critica');
    expect(clasificarUrgencia(180)).toBe('critica');
    expect(clasificarUrgencia(999)).toBe('critica');
  });

  it('los thresholds son exclusivos abajo, inclusivos arriba — sin gaps', () => {
    // Esto previene un bug típico: que un día caiga "entre dos clases".
    // Cubrimos cada threshold:
    expect(clasificarUrgencia(6)).toBe('fresca');
    expect(clasificarUrgencia(7)).toBe('media');
    expect(clasificarUrgencia(29)).toBe('media');
    expect(clasificarUrgencia(30)).toBe('alta');
    expect(clasificarUrgencia(59)).toBe('alta');
    expect(clasificarUrgencia(60)).toBe('critica');
  });
});
