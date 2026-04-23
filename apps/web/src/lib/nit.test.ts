import { describe, it, expect } from 'vitest';
import { calcularDV } from './nit';

/**
 * Tests del cálculo de DV según algoritmo oficial DIAN.
 * Los valores esperados son los producidos por el algoritmo actual —
 * sirven como snapshot para detectar regresiones si alguien toca el código.
 */
describe('calcularDV (DIAN)', () => {
  it('NITs válidos producen el DV esperado', () => {
    expect(calcularDV('900123456')).toBe('8');
    expect(calcularDV('800197268')).toBe('4');
    expect(calcularDV('830053669')).toBe('5');
    expect(calcularDV('860002503')).toBe('2');
    expect(calcularDV('830089511')).toBe('6');
    expect(calcularDV('890903938')).toBe('8');
  });

  it('ignora separadores no numéricos (puntos, guiones, espacios)', () => {
    const esperado = calcularDV('900123456');
    expect(calcularDV('900.123.456')).toBe(esperado);
    expect(calcularDV('900-123-456')).toBe(esperado);
    expect(calcularDV('900 123 456')).toBe(esperado);
  });

  it('rechaza NITs muy cortos o muy largos', () => {
    expect(calcularDV('1234')).toBe(null);
    expect(calcularDV('1234567890123456')).toBe(null);
  });

  it('acepta longitudes 5-15 dígitos (rango oficial DIAN)', () => {
    expect(calcularDV('12345')).toMatch(/^[0-9]$/);
    expect(calcularDV('123456789012345')).toMatch(/^[0-9]$/);
  });

  it('cédula como NIT (persona natural)', () => {
    const dv = calcularDV('79000000');
    expect(dv).toBe('8');
  });
});
