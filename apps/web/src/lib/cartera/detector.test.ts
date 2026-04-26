import { describe, it, expect } from 'vitest';
import { detectarOrigen, normalizarPeriodo, parsearMonto, normalizarTipoDoc } from './detector';

/**
 * Tests del detector de origen y los helpers compartidos por los parsers
 * de cartera. Estos helpers normalizan datos extraídos de PDFs heterogéneos
 * a un formato canónico — si fallan, la cartera queda con períodos / montos
 * inconsistentes y los matches por NIT/cédula se rompen.
 */

describe('detectarOrigen', () => {
  it('detecta Salud Total por NIT 800.130.907-4', () => {
    const r = detectarOrigen('Algún encabezado\nNIT 800.130.907-4\n...');
    expect(r).toEqual({ origen: 'SALUD_TOTAL', confianza: 'alta' });
  });

  it('detecta Salud Total por header explícito', () => {
    const r = detectarOrigen('SALUD TOTAL EPS S.A.\nESTADO DE CUENTA');
    expect(r?.origen).toBe('SALUD_TOTAL');
  });

  it('detecta EPS S.O.S por header', () => {
    const r = detectarOrigen('EPS S.O.S S.A\nLiquidación');
    expect(r).toEqual({ origen: 'EPS_SOS', confianza: 'alta' });
  });

  it('detecta SOS también por título alternativo', () => {
    const r = detectarOrigen('LISTADO DE CARTERA POS DETALLADO POR PERIODO');
    expect(r?.origen).toBe('EPS_SOS');
  });

  it('detecta Sanitas', () => {
    expect(detectarOrigen('EPS Sanitas')?.origen).toBe('EPS_SANITAS');
    expect(detectarOrigen('Sanitas Internacional')?.origen).toBe('EPS_SANITAS');
  });

  it('detecta SURA por footer y URL', () => {
    expect(detectarOrigen('EPS SURAMERICANA S.A.')?.origen).toBe('EPS_SURA');
    expect(detectarOrigen('www.epssura.com')?.origen).toBe('EPS_SURA');
  });

  it('detecta SURA por combinación "ESTADO DE CUENTA EPS" + "DECRETO 3260"', () => {
    expect(detectarOrigen('ESTADO DE CUENTA EPS\n... cumpliendo Decreto 3260 de ...')?.origen).toBe(
      'EPS_SURA',
    );
  });

  it('detecta Protección AFP', () => {
    expect(detectarOrigen('PROTECCION S.A.\nFondo de Pensiones')?.origen).toBe('PROTECCION');
    expect(detectarOrigen('PERIODOS NO COTIZADOS POR AFILIADO')?.origen).toBe('PROTECCION');
  });

  it('Salud Total tiene prioridad sobre SOS si ambos texts aparecen (caso edge)', () => {
    // Header con Salud Total + un texto que también matchea SOS no debería
    // ambiguar — Salud Total debe ganar porque va primero.
    const r = detectarOrigen(
      'SALUD TOTAL EPS\nESTADO DE CUENTA\nMencionando S.O.S incidentalmente',
    );
    expect(r?.origen).toBe('SALUD_TOTAL');
  });

  it('texto sin patrones reconocibles → null', () => {
    expect(detectarOrigen('Otro PDF cualquiera')).toBeNull();
    expect(detectarOrigen('')).toBeNull();
  });
});

describe('normalizarPeriodo', () => {
  it('formato compacto AAAAMM', () => {
    expect(normalizarPeriodo('202512')).toBe('2025-12');
    expect(normalizarPeriodo('202601')).toBe('2026-01');
  });

  it('formato AAAA-MM ya normalizado', () => {
    expect(normalizarPeriodo('2026-04')).toBe('2026-04');
    expect(normalizarPeriodo('2026/04')).toBe('2026-04');
  });

  it('formato MM/AAAA o MM-AAAA', () => {
    expect(normalizarPeriodo('01/2026')).toBe('2026-01');
    expect(normalizarPeriodo('12-2026')).toBe('2026-12');
  });

  it('fecha completa AAAA-MM-DD', () => {
    expect(normalizarPeriodo('2026-04-18')).toBe('2026-04');
    expect(normalizarPeriodo('2026/04/18')).toBe('2026-04');
  });

  it('fecha latina DD-MM-AAAA', () => {
    expect(normalizarPeriodo('18-04-2026')).toBe('2026-04');
    expect(normalizarPeriodo('18/04/2026')).toBe('2026-04');
  });

  it('mes con un solo dígito padea a dos', () => {
    expect(normalizarPeriodo('2026-1')).toBe('2026-01');
    expect(normalizarPeriodo('1/2026')).toBe('2026-01');
  });

  it('mes inválido (>12) → null', () => {
    expect(normalizarPeriodo('2026-13')).toBeNull();
    expect(normalizarPeriodo('202613')).toBeNull();
    expect(normalizarPeriodo('00/2026')).toBeNull();
  });

  it('strings sin formato reconocible → null', () => {
    expect(normalizarPeriodo('abril 2026')).toBeNull();
    expect(normalizarPeriodo('')).toBeNull();
    expect(normalizarPeriodo('???')).toBeNull();
  });
});

describe('parsearMonto', () => {
  it('formato US con coma miles + punto decimal', () => {
    expect(parsearMonto('1,234,567.89')).toBe(1234567.89);
    expect(parsearMonto('70,100.00')).toBe(70100);
  });

  it('formato latino con punto miles (sin decimal)', () => {
    expect(parsearMonto('79.648.596')).toBe(79648596);
    expect(parsearMonto('1.234.567')).toBe(1234567);
  });

  it('formato con coma miles, sin decimales', () => {
    expect(parsearMonto('1,015,810')).toBe(1015810);
    expect(parsearMonto('1,234')).toBe(1234);
  });

  it('respeta el símbolo de pesos y los espacios', () => {
    expect(parsearMonto('$ 7,390,115')).toBe(7390115);
    expect(parsearMonto('$1,234.56')).toBe(1234.56);
    expect(parsearMonto('  $ 70,100  ')).toBe(70100);
  });

  it('un solo punto puede ser decimal (no se elimina)', () => {
    expect(parsearMonto('1234.56')).toBe(1234.56);
    expect(parsearMonto('100.50')).toBe(100.5);
  });

  it('cero', () => {
    expect(parsearMonto('0')).toBe(0);
    expect(parsearMonto('$0.00')).toBe(0);
  });

  it('valores no parseables → null', () => {
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto('abc')).toBeNull();
    expect(parsearMonto('   ')).toBeNull();
  });
});

describe('normalizarTipoDoc', () => {
  it('mapea códigos estándar al enum TipoDocumento', () => {
    expect(normalizarTipoDoc('CC')).toBe('CC');
    expect(normalizarTipoDoc('CE')).toBe('CE');
    expect(normalizarTipoDoc('TI')).toBe('TI');
    expect(normalizarTipoDoc('RC')).toBe('RC');
  });

  it('alias de pasaporte (PT, PA, P → PAS)', () => {
    expect(normalizarTipoDoc('PAS')).toBe('PAS');
    expect(normalizarTipoDoc('PA')).toBe('PAS');
    expect(normalizarTipoDoc('PT')).toBe('PAS');
    expect(normalizarTipoDoc('P')).toBe('PAS');
  });

  it('alias NIT (NI → NIT)', () => {
    expect(normalizarTipoDoc('NIT')).toBe('NIT');
    expect(normalizarTipoDoc('NI')).toBe('NIT');
  });

  it('alias NIP (NU → NIP)', () => {
    expect(normalizarTipoDoc('NIP')).toBe('NIP');
    expect(normalizarTipoDoc('NU')).toBe('NIP');
  });

  it('insensible a mayúsculas y espacios', () => {
    expect(normalizarTipoDoc('cc')).toBe('CC');
    expect(normalizarTipoDoc('  Ti  ')).toBe('TI');
  });

  it('códigos desconocidos → null', () => {
    expect(normalizarTipoDoc('XYZ')).toBeNull();
    expect(normalizarTipoDoc('')).toBeNull();
    expect(normalizarTipoDoc('CCC')).toBeNull();
  });
});
