import { describe, it, expect } from 'vitest';
import {
  padNum,
  padAlpha,
  padMoney,
  padDate,
  padPeriodo,
  padTarifa,
  blank,
  shiftMes,
  assertLength,
  normalizeText,
} from './format';

/**
 * Tests del módulo `format` — helpers de ancho fijo para el archivo plano
 * PILA. Son funciones puras y constantes, así que el cubrimiento es alto
 * y barato. Si rompemos algo acá, todo el TXT sale mal.
 */

describe('padNum', () => {
  it('rellena con ceros a la izquierda', () => {
    expect(padNum(7, 4)).toBe('0007');
    expect(padNum(0, 4)).toBe('0000');
  });

  it('respeta longitud exacta cuando el número alcanza', () => {
    expect(padNum(1234, 4)).toBe('1234');
  });

  it('trunca por la izquierda si excede la longitud (mantiene los últimos N)', () => {
    expect(padNum(123456, 4)).toBe('3456');
  });

  it('convierte negativos a cero (defensivo, nunca debería pasar)', () => {
    expect(padNum(-5, 3)).toBe('000');
  });

  it('trunca decimales sin redondear', () => {
    expect(padNum(7.9, 2)).toBe('07');
    expect(padNum(7.1, 2)).toBe('07');
  });

  it('soporta bigint', () => {
    expect(padNum(123n, 5)).toBe('00123');
  });
});

describe('padAlpha', () => {
  it('rellena con espacios a la derecha', () => {
    expect(padAlpha('AB', 5)).toBe('AB   ');
  });

  it('trunca a la derecha si excede', () => {
    expect(padAlpha('ABCDEF', 3)).toBe('ABC');
  });

  it('null/undefined producen N espacios', () => {
    expect(padAlpha(null, 4)).toBe('    ');
    expect(padAlpha(undefined, 4)).toBe('    ');
  });

  it('aplica normalizeText (uppercase + sin acentos)', () => {
    expect(padAlpha('María', 5)).toBe('MARIA');
    expect(padAlpha('Niño', 5)).toBe('NINO ');
  });
});

describe('blank', () => {
  it('produce N espacios', () => {
    expect(blank(0)).toBe('');
    expect(blank(3)).toBe('   ');
  });
});

describe('padMoney', () => {
  it('formato entero con ceros a la izquierda', () => {
    expect(padMoney(1234, 9)).toBe('000001234');
    expect(padMoney(0, 9)).toBe('000000000');
  });

  it('TRUNCA decimales — no redondea', () => {
    // $1.500.000,99 se reporta como "001500000" (centavos no van a PILA)
    expect(padMoney(1_500_000.99, 9)).toBe('001500000');
    expect(padMoney(1_500_000.01, 9)).toBe('001500000');
  });

  it('null / undefined / no-finito devuelven ceros', () => {
    expect(padMoney(null, 5)).toBe('00000');
    expect(padMoney(undefined, 5)).toBe('00000');
    expect(padMoney(NaN, 5)).toBe('00000');
    expect(padMoney(Infinity, 5)).toBe('00000');
  });

  it('valores negativos se cortan a cero', () => {
    expect(padMoney(-1000, 5)).toBe('00000');
  });

  it('acepta strings numéricos (Decimal de Prisma se pasa como string)', () => {
    expect(padMoney('1750000', 9)).toBe('001750000');
    expect(padMoney('1750000.5', 9)).toBe('001750000');
  });
});

describe('padDate', () => {
  it('formato AAAA-MM-DD desde Date UTC', () => {
    expect(padDate(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01-15');
    expect(padDate(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31');
  });

  it('null/undefined/inválido devuelven 10 espacios', () => {
    expect(padDate(null)).toBe('          ');
    expect(padDate(undefined)).toBe('          ');
    expect(padDate(new Date('fecha-invalida'))).toBe('          ');
  });

  it('acepta string ISO', () => {
    expect(padDate('2026-04-25T00:00:00Z')).toBe('2026-04-25');
  });
});

describe('padPeriodo', () => {
  it('formato AAAA-MM', () => {
    expect(padPeriodo(2026, 4)).toBe('2026-04');
    expect(padPeriodo(2026, 12)).toBe('2026-12');
  });
});

describe('padTarifa', () => {
  it('porcentaje a fracción con N decimales', () => {
    // 16% → 0.16, padeado con 5 decimales en 7 chars
    expect(padTarifa(16, 7)).toBe('0.16000');
    expect(padTarifa(12.5, 7)).toBe('0.12500');
    expect(padTarifa(0, 7)).toBe('0.00000');
  });

  it('ARL nivel I (0.522%) con length 9 → 7 decimales', () => {
    expect(padTarifa(0.522, 9)).toBe('0.0052200');
  });

  it('strings numéricos también', () => {
    expect(padTarifa('4', 7)).toBe('0.04000');
  });

  it('valores negativos o no-finitos devuelven 0', () => {
    expect(padTarifa(-5, 7)).toBe('0.00000');
    expect(padTarifa(NaN, 7)).toBe('0.00000');
  });
});

describe('shiftMes', () => {
  it('avanza un mes simple', () => {
    expect(shiftMes(2026, 4, 1)).toEqual({ anio: 2026, mes: 5 });
  });

  it('cruza año al avanzar de diciembre a enero', () => {
    expect(shiftMes(2026, 12, 1)).toEqual({ anio: 2027, mes: 1 });
  });

  it('retrocede un mes', () => {
    expect(shiftMes(2026, 1, -1)).toEqual({ anio: 2025, mes: 12 });
  });

  it('avanza varios meses cruzando años', () => {
    expect(shiftMes(2026, 6, 8)).toEqual({ anio: 2027, mes: 2 });
  });

  it('caso típico PILA: shift +1 para periodoSalud en plano E', () => {
    // Aporte abril 2026 → salud mayo 2026
    expect(shiftMes(2026, 4, 1)).toEqual({ anio: 2026, mes: 5 });
  });
});

describe('normalizeText', () => {
  it('quita acentos y pasa a uppercase', () => {
    expect(normalizeText('María José')).toBe('MARIA JOSE');
    expect(normalizeText('niño')).toBe('NINO');
    expect(normalizeText('Bogotá')).toBe('BOGOTA');
  });

  it('elimina caracteres no permitidos y colapsa espacios sobrantes', () => {
    expect(normalizeText('Pérez & Cía. (S.A.S.)')).toBe('PEREZ CIA. S.A.S.');
    expect(normalizeText('hola@example.com')).toBe('HOLAEXAMPLE.COM');
  });

  it('preserva guiones, puntos y apóstrofes', () => {
    expect(normalizeText("O'Connor")).toBe("O'CONNOR");
    expect(normalizeText('Pérez-García')).toBe('PEREZ-GARCIA');
    expect(normalizeText('S.A.S.')).toBe('S.A.S.');
  });

  it('colapsa espacios múltiples y trim', () => {
    expect(normalizeText('  Juan   Pérez  ')).toBe('JUAN PEREZ');
  });

  it('string vacío → ""', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('assertLength', () => {
  it('retorna el string si la longitud coincide', () => {
    expect(assertLength('ABC', 3, 'campo')).toBe('ABC');
  });

  it('lanza error si difiere', () => {
    expect(() => assertLength('AB', 3, 'mi-campo')).toThrow(/mi-campo.*longitud 2.*esperaba 3/);
  });
});
