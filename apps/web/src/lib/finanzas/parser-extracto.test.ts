import { describe, it, expect } from 'vitest';
import { parseExtractoBancarioFromTexto } from './parser-extracto';

/**
 * Tests del parser de extractos bancarios. El upload soporta Excel/CSV/PDF;
 * los dos primeros usan `xlsx` y son fáciles de probar pasando un buffer.
 * El PDF usa pdf-parse (binario) — más fácil testar directamente la función
 * `parseExtractoBancarioFromTexto` que recibe el texto extraído.
 *
 * El parser PDF es heurístico: detecta líneas con patrón
 *   <fecha> <concepto> <valor>
 * y debe ser tolerante con variaciones razonables de formato.
 */

describe('parseExtractoBancarioFromTexto — happy path', () => {
  it('extrae 3 movimientos con formato ISO yyyy-mm-dd', () => {
    const texto = `
      Extracto bancario abril 2026
      2026-04-01  Abono incapacidad EPS Sura  1,234,567
      2026-04-15  Abono incapacidad Salud Total  500,000
      2026-04-20  Abono incapacidad SOS  2,500,000.00
    `;
    const r = parseExtractoBancarioFromTexto(texto, { bancoDefault: 'Bancolombia' });
    expect(r.ok).toBe(true);
    expect(r.registros).toHaveLength(3);
    expect(r.registros[0]?.valor).toBe(1234567);
    expect(r.registros[1]?.valor).toBe(500000);
    expect(r.registros[2]?.valor).toBe(2500000);
    expect(r.registros[0]?.bancoOrigen).toBe('Bancolombia');
  });

  it('formato latino dd/mm/yyyy también funciona', () => {
    const texto = `
      01/04/2026  Abono entidad SGSS  1.234.567
      15/04/2026  Otro abono  $ 500,000
    `;
    const r = parseExtractoBancarioFromTexto(texto);
    expect(r.ok).toBe(true);
    expect(r.registros).toHaveLength(2);
    expect(r.registros[0]?.fechaIngreso.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(r.registros[1]?.fechaIngreso.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('formato dd-mm-yyyy con guiones', () => {
    const texto = '15-04-2026  Concepto  100,000';
    const r = parseExtractoBancarioFromTexto(texto);
    expect(r.ok).toBe(true);
    expect(r.registros[0]?.fechaIngreso.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('hash identidad es estable y único por (banco, fecha, valor, concepto)', () => {
    const r1 = parseExtractoBancarioFromTexto('2026-04-01  Abono X  100,000', {
      bancoDefault: 'BBVA',
    });
    const r2 = parseExtractoBancarioFromTexto('2026-04-01  Abono X  100,000', {
      bancoDefault: 'BBVA',
    });
    expect(r1.registros[0]?.hashIdentidad).toBe(r2.registros[0]?.hashIdentidad);

    // Si cambia el banco, cambia el hash
    const r3 = parseExtractoBancarioFromTexto('2026-04-01  Abono X  100,000', {
      bancoDefault: 'Davivienda',
    });
    expect(r3.registros[0]?.hashIdentidad).not.toBe(r1.registros[0]?.hashIdentidad);
  });
});

describe('parseExtractoBancarioFromTexto — filtros y robustez', () => {
  it('descarta líneas sin patrón válido sin romper el resto', () => {
    const texto = `
      Encabezado del banco
      Resumen general — no es movimiento
      2026-04-01  Abono real  500,000
      Footer del extracto
      2026-04-02  Otro  $ 100,000
    `;
    const r = parseExtractoBancarioFromTexto(texto);
    expect(r.ok).toBe(true);
    expect(r.registros).toHaveLength(2);
  });

  it('descarta valores menores a $1.000 (probablemente refs, no movimientos)', () => {
    const texto = `
      2026-04-01  Movimiento real  500,000
      2026-04-01  Línea con id ref 12345  500
      2026-04-02  Otro real  100,000
    `;
    const r = parseExtractoBancarioFromTexto(texto);
    // El de 500 debe descartarse, los de 100k y 500k pasan
    expect(r.registros).toHaveLength(2);
  });

  it('texto vacío → ok=false con error claro', () => {
    const r = parseExtractoBancarioFromTexto('');
    expect(r.ok).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
    expect(r.errores[0]).toMatch(/No se detectaron líneas/);
  });

  it('texto sin patrón → ok=false', () => {
    const r = parseExtractoBancarioFromTexto(
      'Solo texto irrelevante sin fechas ni valores parseables',
    );
    expect(r.ok).toBe(false);
    expect(r.registros).toHaveLength(0);
  });

  it('marca columnasDetectadas como "auto (PDF)" cuando es texto extraído', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  Concepto  100,000');
    expect(r.columnasDetectadas.fecha).toBe('auto (PDF)');
    expect(r.columnasDetectadas.concepto).toBe('auto (PDF)');
    expect(r.columnasDetectadas.valor).toBe('auto (PDF)');
  });

  it('bancoDefault se marca como "manual" en columnasDetectadas', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  X  100,000', {
      bancoDefault: 'BBVA',
    });
    expect(r.columnasDetectadas.banco).toBe('manual');
  });

  it('sin bancoDefault → columnasDetectadas.banco = null', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  X  100,000');
    expect(r.columnasDetectadas.banco).toBeNull();
  });
});

describe('parseExtractoBancarioFromTexto — formato de valor', () => {
  it('acepta valores con $', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  Abono  $ 100,000');
    expect(r.registros[0]?.valor).toBe(100000);
  });

  it('acepta valores con punto miles latino', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  Abono  1.234.567');
    expect(r.registros[0]?.valor).toBe(1234567);
  });

  it('valor cero se descarta (no es un movimiento real)', () => {
    const r = parseExtractoBancarioFromTexto('2026-04-01  X  0');
    expect(r.registros).toHaveLength(0);
  });
});
