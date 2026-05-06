import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma antes de importar el módulo bajo test.
const findUnique = vi.fn();
vi.mock('@pila/db', () => ({
  prisma: {
    permisoCustom: {
      findUnique: (args: unknown) => findUnique(args),
    },
  },
}));

const { puedeAccederModulo } = await import('./permisos-runtime');

describe('puedeAccederModulo · ADMIN', () => {
  beforeEach(() => findUnique.mockReset());

  it('ADMIN siempre tiene acceso, sin tocar BD', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'ADMIN', rolCustomId: null },
      'config.sistema',
    );
    expect(r).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ADMIN tiene acceso aún a módulos inexistentes', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'ADMIN', rolCustomId: null },
      'modulo.que.no.existe',
    );
    expect(r).toBe(true);
  });
});

describe('puedeAccederModulo · sin RolCustom (defaults por rol base)', () => {
  beforeEach(() => findUnique.mockReset());

  it('SOPORTE accede a config.bitacora (rolesAplica incluye ADMIN/SOPORTE/ALIADO_OWNER)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: null },
      'config.bitacora',
    );
    expect(r).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ALIADO_USER NO accede a config.bitacora (no está en rolesAplica)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'ALIADO_USER', rolCustomId: null },
      'config.bitacora',
    );
    expect(r).toBe(false);
  });

  it('SOPORTE NO accede a config.sistema (ADMIN_ONLY)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: null },
      'config.sistema',
    );
    expect(r).toBe(false);
  });

  it('ALIADO_OWNER accede a base_datos (sin rolesAplica → aplica a todos)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'ALIADO_OWNER', rolCustomId: null },
      'base_datos',
    );
    expect(r).toBe(true);
  });

  it('módulo no declarado → deny por defecto', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: null },
      'modulo.inexistente',
    );
    expect(r).toBe(false);
  });

  it('SOPORTE NO accede a admin.cartera (solo aliados)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: null },
      'admin.cartera',
    );
    expect(r).toBe(false);
  });
});

describe('puedeAccederModulo · con RolCustom (matriz manda)', () => {
  beforeEach(() => findUnique.mockReset());

  it('SOPORTE con RolCustom permitido → accede', async () => {
    findUnique.mockResolvedValueOnce({ rolCustomId: 'rc1' });
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: 'rc1' },
      'config.bitacora',
    );
    expect(r).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        rolCustomId_modulo_accion: {
          rolCustomId: 'rc1',
          modulo: 'config.bitacora',
          accion: 'VER',
        },
      },
      select: { rolCustomId: true },
    });
  });

  it('SOPORTE con RolCustom SIN el permiso → bloqueado aunque su rol base lo tendría', async () => {
    findUnique.mockResolvedValueOnce(null);
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: 'rc1' },
      'config.bitacora',
    );
    expect(r).toBe(false);
  });

  it('ALIADO_USER con RolCustom incluyendo módulo administrativo → accede', async () => {
    findUnique.mockResolvedValueOnce({ rolCustomId: 'rc2' });
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'ALIADO_USER', rolCustomId: 'rc2' },
      'admin.cartera',
    );
    expect(r).toBe(true);
  });

  it('módulo desconocido + RolCustom presente → deny (no consulta BD)', async () => {
    const r = await puedeAccederModulo(
      { id: 'u1', role: 'SOPORTE', rolCustomId: 'rc1' },
      'modulo.fantasma',
    );
    expect(r).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
