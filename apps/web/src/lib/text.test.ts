import { describe, it, expect } from 'vitest';
import { titleCase, sentenceCase, titleCaseFields } from './text';

describe('titleCase', () => {
  it('convierte MAYÚSCULAS a Title Case', () => {
    expect(titleCase('JUAN ALEXANDER SEPÚLVEDA')).toBe('Juan Alexander Sepúlveda');
  });

  it('convierte minúsculas a Title Case', () => {
    expect(titleCase('maría de los ángeles')).toBe('María de los Ángeles');
  });

  it('colapsa espacios múltiples', () => {
    expect(titleCase('  carlos    pérez  ')).toBe('Carlos Pérez');
  });

  it('mantiene conectores en minúscula (excepto al inicio)', () => {
    expect(titleCase('de la torre')).toBe('De la Torre');
    expect(titleCase('maría del pilar')).toBe('María del Pilar');
  });

  it('respeta apóstrofes y guiones', () => {
    expect(titleCase("D'ANGELO")).toBe("D'Angelo");
    expect(titleCase('maría-josé')).toBe('María-José');
  });

  it('maneja null/undefined/empty', () => {
    expect(titleCase(null)).toBe('');
    expect(titleCase(undefined)).toBe('');
    expect(titleCase('')).toBe('');
    expect(titleCase('   ')).toBe('');
  });
});

describe('sentenceCase', () => {
  it('primera letra en mayúscula, resto intacto', () => {
    expect(sentenceCase('hola MUNDO')).toBe('Hola MUNDO');
  });

  it('trim pero conserva puntuación', () => {
    expect(sentenceCase('  esta es una frase.  ')).toBe('Esta es una frase.');
  });

  it('maneja null/undefined/empty', () => {
    expect(sentenceCase(null)).toBe('');
    expect(sentenceCase('')).toBe('');
  });
});

describe('titleCaseFields', () => {
  it('aplica titleCase solo a las llaves indicadas', () => {
    const res = titleCaseFields(
      {
        primerNombre: 'JUAN',
        primerApellido: 'PÉREZ',
        email: 'jperez@example.com',
        edad: 30,
      },
      ['primerNombre', 'primerApellido'],
    );
    expect(res).toEqual({
      primerNombre: 'Juan',
      primerApellido: 'Pérez',
      email: 'jperez@example.com',
      edad: 30,
    });
  });

  it('preserva null/undefined en los campos target', () => {
    const res = titleCaseFields(
      { nombre: null as unknown as string, cargo: undefined as unknown as string },
      ['nombre', 'cargo'],
    );
    expect(res).toEqual({ nombre: null, cargo: undefined });
  });
});
