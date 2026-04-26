import { describe, it, expect } from 'vitest';
import {
  aplicaOmisionPension,
  banderasSubsistemas,
  identificacionForzada,
  planillasParaAfiliacion,
  OMISION_AFP_SUBTIPOS,
} from './politicas';

/**
 * Tests de las políticas que deciden cómo se construyen las planillas:
 *   - Qué tipos de planilla genera una afiliación.
 *   - Qué subsistemas (EPS/AFP/ARL/CCF/SENA-ICBF) van a cada plano.
 *   - Qué identificación se fuerza por tipo de plano (resolución, K).
 *
 * Una falla aquí silenciosamente puede generar planillas con subsistemas
 * mal armados — el operador rechaza, pero peor: si no rechaza, terminan
 * cobrando aportes mal.
 */

describe('aplicaOmisionPension', () => {
  it('los subtipos del set retornan true', () => {
    for (const code of OMISION_AFP_SUBTIPOS) {
      expect(aplicaOmisionPension(code)).toBe(true);
    }
  });

  it('subtipos fuera del set retornan false', () => {
    expect(aplicaOmisionPension('00')).toBe(false);
    expect(aplicaOmisionPension('01')).toBe(false);
    expect(aplicaOmisionPension('99')).toBe(false);
  });

  it('null/undefined/empty no aplican omisión', () => {
    expect(aplicaOmisionPension(null)).toBe(false);
    expect(aplicaOmisionPension(undefined)).toBe(false);
    expect(aplicaOmisionPension('')).toBe(false);
  });

  it('cubre los códigos canónicos: 02, 03, 04, 05, 12', () => {
    // Estos son los subtipos donde la afiliación NO cotiza pensión.
    // Si alguien cambia el set sin actualizar negocio, este test falla.
    expect(OMISION_AFP_SUBTIPOS.has('02')).toBe(true);
    expect(OMISION_AFP_SUBTIPOS.has('03')).toBe(true);
    expect(OMISION_AFP_SUBTIPOS.has('04')).toBe(true);
    expect(OMISION_AFP_SUBTIPOS.has('05')).toBe(true);
    expect(OMISION_AFP_SUBTIPOS.has('12')).toBe(true);
    expect(OMISION_AFP_SUBTIPOS.size).toBe(5);
  });
});

describe('banderasSubsistemas', () => {
  it('plano K (Decreto 2616) → solo ARL', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'K', regimen: null });
    expect(b).toEqual({
      aplicaEps: false,
      aplicaAfp: false,
      aplicaArl: true,
      aplicaCcf: false,
      aplicaSenaIcbf: false,
    });
  });

  it('plano K aún con régimen RESOLUCIÓN sigue siendo solo ARL', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'K', regimen: 'RESOLUCION' });
    expect(b.aplicaArl).toBe(true);
    expect(b.aplicaEps).toBe(false);
  });

  it('plano E + RESOLUCIÓN → solo EPS', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'E', regimen: 'RESOLUCION' });
    expect(b).toEqual({
      aplicaEps: true,
      aplicaAfp: false,
      aplicaArl: false,
      aplicaCcf: false,
      aplicaSenaIcbf: false,
    });
  });

  it('plano E + ORDINARIO → todos los subsistemas', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'E', regimen: 'ORDINARIO' });
    expect(b.aplicaEps).toBe(true);
    expect(b.aplicaAfp).toBe(true);
    expect(b.aplicaArl).toBe(true);
    expect(b.aplicaCcf).toBe(true);
    expect(b.aplicaSenaIcbf).toBe(true);
  });

  it('plano I (independiente) → todos los subsistemas', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'I', regimen: 'ORDINARIO' });
    expect(b.aplicaEps).toBe(true);
    expect(b.aplicaAfp).toBe(true);
    expect(b.aplicaArl).toBe(true);
    expect(b.aplicaCcf).toBe(true);
    expect(b.aplicaSenaIcbf).toBe(true);
  });

  it('régimen null en plano E asume ORDINARIO (default seguro)', () => {
    const b = banderasSubsistemas({ tipoPlanilla: 'E', regimen: null });
    expect(b.aplicaAfp).toBe(true);
    expect(b.aplicaCcf).toBe(true);
  });
});

describe('identificacionForzada', () => {
  it('plano E + RESOLUCIÓN: tipo doc PA, cotizante 01, subtipo 04', () => {
    const ov = identificacionForzada({ tipoPlanilla: 'E', regimen: 'RESOLUCION' });
    expect(ov).toEqual({
      tipoDocOverride: 'PA',
      tipoCotizanteOverride: '01',
      subtipoOverride: '04',
    });
  });

  it('plano K: cotizante 23, subtipo 00 (sin override de tipo doc)', () => {
    const ov = identificacionForzada({ tipoPlanilla: 'K', regimen: 'RESOLUCION' });
    expect(ov).toEqual({
      tipoDocOverride: null,
      tipoCotizanteOverride: '23',
      subtipoOverride: '00',
    });
  });

  it('plano E + ORDINARIO: ningún override', () => {
    const ov = identificacionForzada({ tipoPlanilla: 'E', regimen: 'ORDINARIO' });
    expect(ov).toEqual({
      tipoDocOverride: null,
      tipoCotizanteOverride: null,
      subtipoOverride: null,
    });
  });

  it('plano I: ningún override', () => {
    const ov = identificacionForzada({ tipoPlanilla: 'I', regimen: 'ORDINARIO' });
    expect(ov.tipoDocOverride).toBeNull();
    expect(ov.tipoCotizanteOverride).toBeNull();
    expect(ov.subtipoOverride).toBeNull();
  });
});

describe('planillasParaAfiliacion', () => {
  const planCompleto = {
    incluyeEps: true,
    incluyeAfp: true,
    incluyeArl: true,
    incluyeCcf: true,
  };
  const planSoloArl = {
    incluyeEps: false,
    incluyeAfp: false,
    incluyeArl: true,
    incluyeCcf: false,
  };
  const planEpsArl = {
    incluyeEps: true,
    incluyeAfp: false,
    incluyeArl: true,
    incluyeCcf: false,
  };

  it('ORDINARIO + DEPENDIENTE → [E]', () => {
    expect(
      planillasParaAfiliacion({
        modalidad: 'DEPENDIENTE',
        regimen: 'ORDINARIO',
        plan: planCompleto,
      }),
    ).toEqual(['E']);
  });

  it('ORDINARIO + INDEPENDIENTE → [I]', () => {
    expect(
      planillasParaAfiliacion({
        modalidad: 'INDEPENDIENTE',
        regimen: 'ORDINARIO',
        plan: planCompleto,
      }),
    ).toEqual(['I']);
  });

  it('RESOLUCIÓN + plan solo ARL → [K]', () => {
    expect(
      planillasParaAfiliacion({
        modalidad: 'DEPENDIENTE',
        regimen: 'RESOLUCION',
        plan: planSoloArl,
      }),
    ).toEqual(['K']);
  });

  it('RESOLUCIÓN + plan EPS+ARL → [E, K]', () => {
    expect(
      planillasParaAfiliacion({
        modalidad: 'DEPENDIENTE',
        regimen: 'RESOLUCION',
        plan: planEpsArl,
      }),
    ).toEqual(['E', 'K']);
  });

  it('RESOLUCIÓN con plan no soportado → fallback [E] (default)', () => {
    // Plan EPS+AFP en RESOLUCIÓN no está cubierto explícitamente.
    expect(
      planillasParaAfiliacion({
        modalidad: 'DEPENDIENTE',
        regimen: 'RESOLUCION',
        plan: { incluyeEps: true, incluyeAfp: true, incluyeArl: false, incluyeCcf: false },
      }),
    ).toEqual(['E']);
  });

  it('regimen null en INDEPENDIENTE → [I]', () => {
    expect(
      planillasParaAfiliacion({
        modalidad: 'INDEPENDIENTE',
        regimen: null,
        plan: planCompleto,
      }),
    ).toEqual(['I']);
  });
});
