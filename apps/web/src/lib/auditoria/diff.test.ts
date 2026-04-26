import { describe, it, expect } from 'vitest';
import { calcularDiff } from './diff';

/**
 * Tests del cálculo puro de diff. Esta es la lógica que decide qué
 * campos se guardan en la bitácora — vital que sea correcta porque
 * influye en lo que ve el usuario en el modal de auditoría.
 */

describe('calcularDiff', () => {
  describe('casos triviales', () => {
    it('ambos null → null', () => {
      expect(calcularDiff(null, null)).toBeNull();
    });

    it('mismo objeto idéntico → null (no hay cambios)', () => {
      const obj = { a: 1, b: 'hola' };
      expect(calcularDiff(obj, obj)).toBeNull();
    });

    it('objetos distintos pero con mismos valores → null', () => {
      const a = { x: 1, y: 'foo' };
      const b = { x: 1, y: 'foo' };
      expect(calcularDiff(a, b)).toBeNull();
    });
  });

  describe('CREATE (antes=null)', () => {
    it('captura todos los campos del nuevo objeto', () => {
      const r = calcularDiff(null, { nombre: 'Juan', edad: 30 });
      expect(r).toEqual({
        antes: {},
        despues: { nombre: 'Juan', edad: 30 },
        campos: ['nombre', 'edad'],
      });
    });

    it('respeta camposPermitidos', () => {
      const r = calcularDiff(
        null,
        { nombre: 'Juan', edad: 30, passwordHash: 'secret' },
        ['nombre', 'edad'], // passwordHash excluido
      );
      expect(r).toEqual({
        antes: {},
        despues: { nombre: 'Juan', edad: 30 },
        campos: ['nombre', 'edad'],
      });
    });

    it('objeto vacío → null', () => {
      expect(calcularDiff(null, {})).toBeNull();
    });
  });

  describe('DELETE (despues=null)', () => {
    it('captura todos los campos del objeto eliminado', () => {
      const r = calcularDiff({ nombre: 'Juan', edad: 30 }, null);
      expect(r).toEqual({
        antes: { nombre: 'Juan', edad: 30 },
        despues: {},
        campos: ['nombre', 'edad'],
      });
    });

    it('respeta camposPermitidos', () => {
      const r = calcularDiff({ nombre: 'Juan', edad: 30, passwordHash: 'secret' }, null, [
        'nombre',
        'edad',
      ]);
      expect(r).toEqual({
        antes: { nombre: 'Juan', edad: 30 },
        despues: {},
        campos: ['nombre', 'edad'],
      });
    });
  });

  describe('UPDATE — un campo cambia', () => {
    it('detecta cambio simple de string', () => {
      const r = calcularDiff({ nombre: 'Juan', edad: 30 }, { nombre: 'Pedro', edad: 30 });
      expect(r).toEqual({
        antes: { nombre: 'Juan' },
        despues: { nombre: 'Pedro' },
        campos: ['nombre'],
      });
    });

    it('detecta cambio numérico', () => {
      const r = calcularDiff({ valor: 100 }, { valor: 200 });
      expect(r?.campos).toEqual(['valor']);
      expect(r?.antes).toEqual({ valor: 100 });
      expect(r?.despues).toEqual({ valor: 200 });
    });

    it('detecta cambio boolean', () => {
      const r = calcularDiff({ active: true }, { active: false });
      expect(r?.campos).toEqual(['active']);
    });

    it('detecta múltiples campos cambiados', () => {
      const r = calcularDiff(
        { nombre: 'Juan', edad: 30, ciudad: 'Bogotá' },
        { nombre: 'Pedro', edad: 31, ciudad: 'Bogotá' },
      );
      expect(r?.campos.sort()).toEqual(['edad', 'nombre']);
      expect(r?.antes).toEqual({ nombre: 'Juan', edad: 30 });
      expect(r?.despues).toEqual({ nombre: 'Pedro', edad: 31 });
    });
  });

  describe('null vs undefined — equivalencia', () => {
    it('null y undefined se consideran iguales (no marca diff)', () => {
      const r = calcularDiff({ valor: null }, { valor: undefined });
      expect(r).toBeNull();
    });

    it('campo opcional ausente vs null no marca diff', () => {
      const r = calcularDiff({}, { valor: null });
      expect(r).toBeNull();
    });

    it('null → string sí marca diff', () => {
      const r = calcularDiff({ telefono: null }, { telefono: '300123' });
      expect(r?.campos).toEqual(['telefono']);
    });

    it('string → null sí marca diff', () => {
      const r = calcularDiff({ telefono: '300123' }, { telefono: null });
      expect(r?.campos).toEqual(['telefono']);
      expect(r?.antes).toEqual({ telefono: '300123' });
      expect(r?.despues).toEqual({ telefono: null });
    });
  });

  describe('Date', () => {
    it('mismas fechas → no marca diff', () => {
      const d = new Date('2026-01-01');
      const r = calcularDiff({ fecha: d }, { fecha: new Date('2026-01-01') });
      expect(r).toBeNull();
    });

    it('fechas distintas → marca diff', () => {
      const r = calcularDiff({ fecha: new Date('2026-01-01') }, { fecha: new Date('2026-02-01') });
      expect(r?.campos).toEqual(['fecha']);
    });
  });

  describe('campos sensibles excluidos por camposPermitidos', () => {
    it('passwordHash que cambió no aparece si no está permitido', () => {
      const r = calcularDiff(
        { email: 'a@b.com', passwordHash: 'old_hash' },
        { email: 'a@b.com', passwordHash: 'new_hash' },
        ['email'], // solo email
      );
      // No hubo cambio en email → null
      expect(r).toBeNull();
    });

    it('cambia campo no permitido + cambia campo permitido → solo aparece el permitido', () => {
      const r = calcularDiff(
        { email: 'a@b.com', passwordHash: 'old' },
        { email: 'b@c.com', passwordHash: 'new' },
        ['email'],
      );
      expect(r?.campos).toEqual(['email']);
      expect(r?.antes).toEqual({ email: 'a@b.com' });
      expect(r?.despues).toEqual({ email: 'b@c.com' });
    });
  });

  describe('arrays y objetos anidados', () => {
    it('mismo array → no marca diff', () => {
      const r = calcularDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] });
      expect(r).toBeNull();
    });

    it('arrays distintos → marca diff', () => {
      const r = calcularDiff({ tags: ['a', 'b'] }, { tags: ['a', 'c'] });
      expect(r?.campos).toEqual(['tags']);
    });

    it('arrays con mismo contenido en distinto orden → marca diff (esperado)', () => {
      // Este es el comportamiento esperado: JSON.stringify es sensible
      // al orden. Si en el futuro queremos compararlos como sets, se ajusta.
      const r = calcularDiff({ tags: ['a', 'b'] }, { tags: ['b', 'a'] });
      expect(r?.campos).toEqual(['tags']);
    });

    it('objetos anidados iguales → no marca diff', () => {
      const r = calcularDiff({ meta: { a: 1, b: 2 } }, { meta: { a: 1, b: 2 } });
      expect(r).toBeNull();
    });

    it('objetos anidados distintos → marca diff', () => {
      const r = calcularDiff({ meta: { a: 1, b: 2 } }, { meta: { a: 1, b: 3 } });
      expect(r?.campos).toEqual(['meta']);
    });
  });

  describe('Decimal-like (objetos con toString)', () => {
    // Simula el Decimal de Prisma — es un objeto con toString() que
    // retorna el valor como string.
    class DecimalMock {
      constructor(public value: string) {}
      toString() {
        return this.value;
      }
    }

    it('mismos Decimal → no marca diff', () => {
      const r = calcularDiff(
        { valor: new DecimalMock('100.50') },
        { valor: new DecimalMock('100.50') },
      );
      expect(r).toBeNull();
    });

    it('Decimal distintos → marca diff', () => {
      const r = calcularDiff(
        { valor: new DecimalMock('100.50') },
        { valor: new DecimalMock('200.00') },
      );
      expect(r?.campos).toEqual(['valor']);
    });
  });
});
