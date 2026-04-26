import { describe, it, expect } from 'vitest';
import { prepararPayload } from './payload';

/**
 * Tests de la lógica pura del wrapper. Validan:
 *   1. Filtrado automático de campos sensibles globales (passwordHash,
 *      tokens, etc.) cuando el caller NO pasa `camposPermitidos`.
 *   2. UPDATE sin cambios → null (no se registra).
 *   3. Cuando se pasan `camposPermitidos`, esa lista manda y el filtro
 *      global queda desactivado.
 *   4. Descripciones por defecto.
 *
 * No tocamos `registrarAuditoria` (eso usa Prisma y NextAuth) — para eso
 * está separada la función pura.
 */

describe('prepararPayload — CREAR', () => {
  it('captura el snapshot del recurso creado', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'Cotizante',
      entidadId: 'cot1',
      entidadSucursalId: 'suc1',
      despues: { nombre: 'Juan', email: 'juan@x.com' },
    });
    expect(p).not.toBeNull();
    expect(p!.accion).toBe('CREAR');
    expect(p!.entidad).toBe('Cotizante');
    expect(p!.entidadSucursalId).toBe('suc1');
    expect(p!.cambios?.despues).toEqual({ nombre: 'Juan', email: 'juan@x.com' });
  });

  it('descarta passwordHash automáticamente si no hay camposPermitidos', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'User',
      entidadId: 'u1',
      despues: { email: 'a@b.com', passwordHash: 'secreto', name: 'Ana' },
    });
    expect(p!.cambios?.despues).toEqual({ email: 'a@b.com', name: 'Ana' });
    expect(p!.cambios?.despues).not.toHaveProperty('passwordHash');
  });

  it('descarta otros sensibles: token, apiKey, apiSecret, pagosimplePin', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'Config',
      entidadId: 'c1',
      despues: {
        nombre: 'X',
        token: 't',
        apiKey: 'k',
        apiSecret: 's',
        pagosimplePin: '1234',
      },
    });
    expect(p!.cambios?.despues).toEqual({ nombre: 'X' });
  });

  it('cuando se pasa camposPermitidos, manda esa lista (filtro global desactivado)', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'User',
      entidadId: 'u1',
      despues: { email: 'a@b.com', passwordHash: 'secreto' },
      camposPermitidos: ['email'],
    });
    expect(p!.cambios?.despues).toEqual({ email: 'a@b.com' });
  });

  it('descripción por defecto incluye la entidad', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'Empresa',
      entidadId: 'e1',
      despues: { nit: '900111' },
    });
    expect(p!.descripcion).toBe('Creó Empresa');
  });

  it('respeta descripcion personalizada', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'Cotizante',
      entidadId: 'c1',
      despues: { nombre: 'X' },
      descripcion: 'Afilió por importación masiva',
    });
    expect(p!.descripcion).toBe('Afilió por importación masiva');
  });

  it('CREATE con objeto vacío después de filtrar sensibles → null', () => {
    const p = prepararPayload('CREAR', {
      entidad: 'X',
      entidadId: '1',
      despues: { passwordHash: 'a', token: 'b' }, // todo sensible
    });
    expect(p).toBeNull();
  });
});

describe('prepararPayload — EDITAR', () => {
  it('registra cuando hay cambios reales', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'Cotizante',
      entidadId: 'c1',
      antes: { salario: 1000 },
      despues: { salario: 2000 },
    });
    expect(p).not.toBeNull();
    expect(p!.accion).toBe('EDITAR');
    expect(p!.cambios?.campos).toEqual(['salario']);
  });

  it('NO registra si no hay cambios', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'Cotizante',
      entidadId: 'c1',
      antes: { salario: 1000 },
      despues: { salario: 1000 },
    });
    expect(p).toBeNull();
  });

  it('si solo cambió un campo sensible filtrado, no registra', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'User',
      entidadId: 'u1',
      antes: { email: 'a@b.com', passwordHash: 'old' },
      despues: { email: 'a@b.com', passwordHash: 'new' },
    });
    expect(p).toBeNull();
  });

  it('si cambió un sensible Y un no-sensible, solo aparece el no-sensible', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'User',
      entidadId: 'u1',
      antes: { email: 'a@b.com', passwordHash: 'old' },
      despues: { email: 'b@c.com', passwordHash: 'new' },
    });
    expect(p!.cambios?.campos).toEqual(['email']);
    expect(p!.cambios?.antes).toEqual({ email: 'a@b.com' });
    expect(p!.cambios?.despues).toEqual({ email: 'b@c.com' });
  });

  it('descripción por defecto cuenta los campos cambiados', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'Cotizante',
      entidadId: 'c1',
      antes: { salario: 1000, telefono: '300' },
      despues: { salario: 2000, telefono: '400' },
    });
    expect(p!.descripcion).toBe('Editó Cotizante (2 campo(s))');
  });

  it('descripcion personalizada gana sobre la default', () => {
    const p = prepararPayload('EDITAR', {
      entidad: 'Incapacidad',
      entidadId: 'i1',
      antes: { estado: 'RADICADA' },
      despues: { estado: 'APROBADA' },
      descripcion: 'Aprobada por revisor',
    });
    expect(p!.descripcion).toBe('Aprobada por revisor');
  });
});

describe('prepararPayload — ELIMINAR', () => {
  it('captura el snapshot del recurso eliminado', () => {
    const p = prepararPayload('ELIMINAR', {
      entidad: 'Cotizante',
      entidadId: 'c1',
      antes: { nombre: 'Juan', email: 'juan@x.com' },
    });
    expect(p!.accion).toBe('ELIMINAR');
    expect(p!.cambios?.antes).toEqual({ nombre: 'Juan', email: 'juan@x.com' });
  });

  it('descarta sensibles', () => {
    const p = prepararPayload('ELIMINAR', {
      entidad: 'User',
      entidadId: 'u1',
      antes: { email: 'a@b.com', passwordHash: 'h' },
    });
    expect(p!.cambios?.antes).toEqual({ email: 'a@b.com' });
  });

  it('respeta camposPermitidos', () => {
    const p = prepararPayload('ELIMINAR', {
      entidad: 'User',
      entidadId: 'u1',
      antes: { email: 'a@b.com', name: 'Ana', passwordHash: 'h' },
      camposPermitidos: ['email'],
    });
    expect(p!.cambios?.antes).toEqual({ email: 'a@b.com' });
  });

  it('default descripcion incluye la entidad', () => {
    const p = prepararPayload('ELIMINAR', {
      entidad: 'Empresa',
      entidadId: 'e1',
      antes: { nit: '900111' },
    });
    expect(p!.descripcion).toBe('Eliminó Empresa');
  });
});
