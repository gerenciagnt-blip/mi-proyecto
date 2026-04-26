import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePlantillaCotizantes, generarPlantillaCsv } from './csv-import';

/**
 * Tests del parser de importación masiva de cotizantes.
 *
 * Se construyen archivos CSV/Excel "en memoria" para cada caso usando
 * `xlsx.utils.json_to_sheet` + `xlsx.write`. Esto evita depender de
 * archivos físicos y mantiene los tests reproducibles.
 */

function buildCsvBuffer(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'csv' }) as Buffer;
}

describe('parsePlantillaCotizantes — happy path', () => {
  it('parsea una fila válida con todos los campos', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1010202020',
        primerNombre: 'Juan',
        segundoNombre: 'Carlos',
        primerApellido: 'Pérez',
        segundoApellido: 'Gómez',
        fechaNacimiento: '1990-04-15',
        genero: 'M',
        telefono: '6017771122',
        celular: '3001234567',
        email: 'juan@example.com',
        direccion: 'Calle 1',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.validas).toHaveLength(1);
    expect(r.invalidas).toHaveLength(0);
    expect(r.validas[0]?.tipoDocumento).toBe('CC');
    expect(r.validas[0]?.numeroDocumento).toBe('1010202020');
    expect(r.validas[0]?.fechaNacimiento.toISOString().slice(0, 10)).toBe('1990-04-15');
  });

  it('parsea con campos opcionales vacíos', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1010202020',
        primerNombre: 'Juan',
        primerApellido: 'Pérez',
        fechaNacimiento: '1990-04-15',
        genero: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]?.segundoNombre).toBeUndefined();
    expect(r.validas[0]?.email).toBeUndefined();
  });

  it('detecta varios cotizantes en un solo archivo', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
      {
        tipoDocumento: 'CC',
        numeroDocumento: '2222222',
        primerNombre: 'B',
        primerApellido: 'Y',
        fechaNacimiento: '1991-02-02',
        genero: 'F',
      },
      {
        tipoDocumento: 'TI',
        numeroDocumento: '3333333',
        primerNombre: 'C',
        primerApellido: 'Z',
        fechaNacimiento: '2010-03-03',
        genero: 'O',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.validas).toHaveLength(3);
  });
});

describe('parsePlantillaCotizantes — errores por fila', () => {
  it('marca como inválida la fila sin campos requeridos', () => {
    // La columna existe en el header (otra fila la tiene) pero esta fila
    // viene con string vacío.
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '7777777',
        primerNombre: 'Vale',
        primerApellido: 'OK',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: '', // vacío → required falla
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.validas).toHaveLength(1);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.errores.join(' ')).toMatch(/primerNombre/);
  });

  it('marca como inválida la fecha en formato incorrecto', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '15/04/1990', // formato latino, no aceptado
        genero: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.errores.join(' ')).toMatch(/fechaNacimiento/);
  });

  it('marca como inválido un tipo doc no aceptado', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'XX',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.errores.join(' ')).toMatch(/tipoDocumento/);
  });

  it('marca como inválido un email malformado', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
        email: 'no-es-email',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.errores.join(' ')).toMatch(/email/i);
  });

  it('mezcla válidas con inválidas — devuelve ambas listas', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
      {
        tipoDocumento: 'CC',
        numeroDocumento: '2222222',
        // sin primerNombre
        primerApellido: 'Y',
        fechaNacimiento: '1991-01-01',
        genero: 'F',
      },
      {
        tipoDocumento: 'CC',
        numeroDocumento: '3333333',
        primerNombre: 'C',
        primerApellido: 'Z',
        fechaNacimiento: '1992-01-01',
        genero: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.validas).toHaveLength(2);
    expect(r.invalidas).toHaveLength(1);
  });
});

describe('parsePlantillaCotizantes — duplicados intra-archivo', () => {
  it('marca duplicado el segundo registro con mismo (tipoDoc + numeroDoc)', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111', // mismo doc
        primerNombre: 'B',
        primerApellido: 'Y',
        fechaNacimiento: '1991-01-01',
        genero: 'F',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    // El primero queda válido; el segundo va a inválidas con razón de duplicado.
    expect(r.validas).toHaveLength(1);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.errores.join(' ')).toMatch(/duplicado/i);
  });

  it('mismo número con tipo doc distinto NO es duplicado', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
      },
      {
        tipoDocumento: 'TI',
        numeroDocumento: '1111111',
        primerNombre: 'B',
        primerApellido: 'Y',
        fechaNacimiento: '2010-01-01',
        genero: 'F',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.validas).toHaveLength(2);
    expect(r.invalidas).toHaveLength(0);
  });
});

describe('parsePlantillaCotizantes — mapeo flexible de columnas', () => {
  it('acepta variantes con acentos y espacios', () => {
    const buf = buildCsvBuffer([
      {
        'Tipo de Documento': 'CC',
        'Número de documento': '1010202020',
        'Primer Nombre': 'Juan',
        'Primer Apellido': 'Pérez',
        'Fecha de nacimiento': '1990-04-15',
        Género: 'M',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.validas).toHaveLength(1);
    expect(r.columnasDetectadas.tipoDocumento).toBe('Tipo de Documento');
    expect(r.columnasDetectadas.numeroDocumento).toBe('Número de documento');
  });

  it('falla con error claro si falta una columna requerida', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        // sin primerNombre, primerApellido, fechaNacimiento, genero
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(false);
    expect(r.errores[0]).toMatch(/columnas obligatorias/i);
  });

  it('reporta columnas extra como ignoradas (no rompe)', () => {
    const buf = buildCsvBuffer([
      {
        tipoDocumento: 'CC',
        numeroDocumento: '1111111',
        primerNombre: 'A',
        primerApellido: 'X',
        fechaNacimiento: '1990-01-01',
        genero: 'M',
        ColumnaInventada: 'algo',
        OtraColumna: 'otra cosa',
      },
    ]);
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.columnasIgnoradas).toContain('ColumnaInventada');
    expect(r.columnasIgnoradas).toContain('OtraColumna');
  });
});

describe('generarPlantillaCsv', () => {
  it('produce un CSV con header + ejemplo', () => {
    const csv = generarPlantillaCsv();
    expect(csv).toMatch(/tipoDocumento/);
    expect(csv).toMatch(/CC/);
    expect(csv).toMatch(/1010202020/);
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('el CSV generado se puede re-parsear sin errores', () => {
    const csv = generarPlantillaCsv();
    const buf = Buffer.from(csv, 'utf8');
    const r = parsePlantillaCotizantes(buf);
    expect(r.ok).toBe(true);
    expect(r.validas).toHaveLength(1);
  });
});
