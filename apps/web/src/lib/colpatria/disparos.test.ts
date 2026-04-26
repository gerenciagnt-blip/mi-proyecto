import { describe, it, expect } from 'vitest';

/**
 * Tests de la lógica pura de decisión "¿esta afiliación dispara el bot
 * Colpatria?". Re-implementamos el chequeo de guards localmente para no
 * mockear Prisma — la responsabilidad real del archivo `disparos.ts` es
 * la consulta + el snapshot, ambos con DB.
 *
 * La regla:
 *   1. modalidad === 'DEPENDIENTE'
 *   2. estado === 'ACTIVA'
 *   3. empresa.colpatriaActivo === true
 *   4. arl.codigo en COLPATRIA_CODIGOS o arl.nombre incluye COLPATRIA
 */

const COLPATRIA_CODIGOS = ['ARL-007', 'COLPATRIA', 'ARL-COLPATRIA'];

type Snapshot = {
  modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
  estado: 'ACTIVA' | 'INACTIVA';
  empresa: { colpatriaActivo: boolean } | null;
  arl: { codigo: string; nombre: string } | null;
};

function debeDisparar(s: Snapshot): boolean {
  if (s.modalidad !== 'DEPENDIENTE') return false;
  if (s.estado !== 'ACTIVA') return false;
  if (!s.empresa || !s.empresa.colpatriaActivo) return false;
  if (!s.arl) return false;
  const cod = s.arl.codigo.toUpperCase().trim();
  if (COLPATRIA_CODIGOS.some((c) => cod === c)) return true;
  if (s.arl.nombre.toUpperCase().includes('COLPATRIA')) return true;
  return false;
}

const empresaActiva = { colpatriaActivo: true };
const arlColpatria = { codigo: 'ARL-007', nombre: 'AXA COLPATRIA SEGUROS DE VIDA' };

describe('debeDisparar — happy path', () => {
  it('DEPENDIENTE + ACTIVA + empresa activa + ARL Colpatria → dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: arlColpatria,
      }),
    ).toBe(true);
  });

  it('matchea por código ARL-COLPATRIA', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: { codigo: 'ARL-COLPATRIA', nombre: 'Otra cosa' },
      }),
    ).toBe(true);
  });

  it('matchea por nombre que contiene COLPATRIA aunque código no esté en lista', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: { codigo: 'ARL-XYZ', nombre: 'Colpatria ARL S.A.' },
      }),
    ).toBe(true);
  });

  it('matchea código case-insensitive (con espacios)', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: { codigo: '  arl-007  ', nombre: '' },
      }),
    ).toBe(true);
  });
});

describe('debeDisparar — guards niegan', () => {
  it('INDEPENDIENTE → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'INDEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: arlColpatria,
      }),
    ).toBe(false);
  });

  it('INACTIVA → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'INACTIVA',
        empresa: empresaActiva,
        arl: arlColpatria,
      }),
    ).toBe(false);
  });

  it('empresa con colpatriaActivo=false → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: { colpatriaActivo: false },
        arl: arlColpatria,
      }),
    ).toBe(false);
  });

  it('empresa null → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: null,
        arl: arlColpatria,
      }),
    ).toBe(false);
  });

  it('ARL null → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: null,
      }),
    ).toBe(false);
  });

  it('ARL distinta a Colpatria → no dispara', () => {
    expect(
      debeDisparar({
        modalidad: 'DEPENDIENTE',
        estado: 'ACTIVA',
        empresa: empresaActiva,
        arl: { codigo: 'ARL-001', nombre: 'SURA ARL' },
      }),
    ).toBe(false);
  });
});
