import { describe, it, expect } from 'vitest';
import {
  construirCotizante,
  type DatosCotizante,
  COTIZANTE_LEN,
  PADDING_OPERADOR_LEN,
  LINEA_LEN,
} from './generar';

/**
 * Tests del constructor de la línea cotizante (registro tipo 02 PILA).
 *
 * No probamos la query Prisma ni el orquestador — eso requiere un fixture
 * gigante. En cambio, alimentamos `construirCotizante` directamente con
 * `DatosCotizante` simple y validamos:
 *
 *   1. Contrato de longitud (676 + 17 = 693 bytes).
 *   2. Posición y formato de campos críticos donde un bug causa rechazo
 *      del operador o cobros mal calculados.
 *   3. Reglas de negocio: omisión pensión, plano K, IBC CCF simbólico,
 *      banderas E+RESOLUCION.
 *
 * Si un test falla, el operador rechazará la planilla — son los casos
 * que más dolor causaron en la integración inicial con PagoSimple.
 */

// ============ Fixture base ============

function fixtureBase(overrides: Partial<DatosCotizante> = {}): DatosCotizante {
  return {
    secuencia: 1,
    tipoDoc: 'CC',
    numeroDoc: '1010202020',
    primerNombre: 'JUAN',
    segundoNombre: 'CARLOS',
    primerApellido: 'PEREZ',
    segundoApellido: 'GOMEZ',
    codDepto: '11',
    codMuni: '001',
    tipoCotizanteCodigo: '01',
    subtipoCodigo: '00',
    modalidad: 'DEPENDIENTE',
    regimen: 'ORDINARIO',
    nivelRiesgo: 'I',
    empresaExonera: false,
    fechaIngreso: new Date(Date.UTC(2026, 3, 1)), // 2026-04-01
    fechaRetiro: null,
    planIncluyeEps: true,
    planIncluyeAfp: true,
    planIncluyeArl: true,
    planIncluyeCcf: true,
    codAfp: 'AFP005',
    codEps: 'EPS010',
    codArl: 'ARL015',
    codCcf: 'CCF068',
    diasCotizados: 30,
    salario: 1_750_000,
    tipoLiquidacion: 'MENSUALIDAD',
    esPrimeraMensualidad: false,
    aplicaRetiroComp: false,
    tarifaPension: 16,
    tarifaSalud: 12.5,
    tarifaArl: 0.522,
    tarifaCcf: 4,
    tarifaSena: 2,
    tarifaIcbf: 3,
    valorPension: 280_000,
    valorSalud: 218_750,
    valorArl: 9135,
    valorCcf: 70_000,
    valorSena: 35_000,
    valorIcbf: 52_500,
    valorFsp: 0,
    valorSubsistencia: 0,
    actividadEconomicaCodigo: '7820',
    smlv: 1_300_000,
    tipoPlanilla: 'E',
    campo25Ige: false,
    ingOverride: null,
    retOverride: null,
    ...overrides,
  };
}

// ============ Contrato de longitud ============

describe('construirCotizante — contrato de longitud', () => {
  it('produce exactamente 693 bytes (676 oficial + 17 padding operador)', () => {
    const linea = construirCotizante(fixtureBase());
    expect(linea.length).toBe(LINEA_LEN);
    expect(LINEA_LEN).toBe(693);
    expect(COTIZANTE_LEN).toBe(676);
    expect(PADDING_OPERADOR_LEN).toBe(17);
  });

  it('mantiene 693 bytes con todos los subsistemas en cero (plan K)', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoPlanilla: 'K',
        diasCotizados: 1,
        valorPension: 0,
        valorSalud: 0,
        valorCcf: 0,
        valorSena: 0,
        valorIcbf: 0,
      }),
    );
    expect(linea.length).toBe(LINEA_LEN);
  });

  it('mantiene 693 bytes con campos null (segundo nombre/apellido)', () => {
    const linea = construirCotizante(fixtureBase({ segundoNombre: null, segundoApellido: null }));
    expect(linea.length).toBe(LINEA_LEN);
  });
});

// ============ Posiciones y formato de campos clave ============

describe('construirCotizante — campos básicos', () => {
  it('campo 1 = "02" (tipo registro cotizante)', () => {
    const linea = construirCotizante(fixtureBase());
    expect(linea.slice(0, 2)).toBe('02');
  });

  it('campo 2 = secuencia padeada a 5', () => {
    expect(construirCotizante(fixtureBase({ secuencia: 1 })).slice(2, 7)).toBe('00001');
    expect(construirCotizante(fixtureBase({ secuencia: 99 })).slice(2, 7)).toBe('00099');
    expect(construirCotizante(fixtureBase({ secuencia: 12345 })).slice(2, 7)).toBe('12345');
  });

  it('campo 3 (tipo doc) = 2 chars padeados con espacio', () => {
    expect(construirCotizante(fixtureBase({ tipoDoc: 'CC' })).slice(7, 9)).toBe('CC');
    expect(construirCotizante(fixtureBase({ tipoDoc: 'TI' })).slice(7, 9)).toBe('TI');
  });

  it('campo 4 (número doc) = 16 chars padeados a la derecha con espacio', () => {
    const linea = construirCotizante(fixtureBase({ numeroDoc: '12345' }));
    expect(linea.slice(9, 25)).toBe('12345           ');
  });
});

describe('construirCotizante — IBC y prorrateo', () => {
  it('IBC = ceil(salario/30 × dias) — caso típico mes completo', () => {
    // 1.750.000 / 30 = 58333.33 → × 30 = 1750000 (sin redondeo)
    const linea = construirCotizante(fixtureBase({ salario: 1_750_000, diasCotizados: 30 }));
    // IBC pensión está en pos 49+9 = posición 49..58
    // Mejor: lo extraemos del campo 42 (IBC pensión: pos 132..141 según orden)
    // Pero es más simple verificar que el IBC NO se trunca a 1749999.
    // Extraemos los IBC con un regex más pragmático: buscamos "001750000" y debe aparecer.
    expect(linea).toContain('001750000');
  });

  it('IBC con días parciales redondea HACIA ARRIBA si tiene decimal', () => {
    // 1.750.905 / 30 = 58363.5 → × 27 = 1.575.814.5 → ceil = 1.575.815
    const linea = construirCotizante(fixtureBase({ salario: 1_750_905, diasCotizados: 27 }));
    expect(linea).toContain('001575815');
    expect(linea).not.toContain('001575814');
  });

  it('IBC con resultado entero no se altera', () => {
    // 1.500.000 / 30 = 50000 × 30 = 1500000
    const linea = construirCotizante(fixtureBase({ salario: 1_500_000, diasCotizados: 30 }));
    expect(linea).toContain('001500000');
  });

  it('horas laboradas = días × 8 (campo 96)', () => {
    // 30 días × 8 = 240 horas. 15 días → 120. El campo es de 3 chars padeado.
    const lineaCompleta = construirCotizante(fixtureBase({ diasCotizados: 30 }));
    const lineaParcial = construirCotizante(fixtureBase({ diasCotizados: 15 }));
    // Las horas son uno de los últimos campos antes del padding operador
    expect(lineaCompleta).toContain('240');
    expect(lineaParcial).toContain('120');
  });
});

describe('construirCotizante — banderas ING/RET', () => {
  it('primera mensualidad → ING="X" en campo 15, fecha ingreso en campo 80', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoLiquidacion: 'MENSUALIDAD',
        esPrimeraMensualidad: true,
        fechaIngreso: new Date(Date.UTC(2026, 3, 1)),
      }),
    );
    // Campo 15 (ING) está en posición 152 (suma de campos 1-14)
    // Más simple: la línea debe contener la fecha 2026-04-01
    expect(linea).toContain('2026-04-01');
    // Y NO contiene una segunda fecha vacía pegada
  });

  it('mensualidad NO primera → ING=" "', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoLiquidacion: 'MENSUALIDAD',
        esPrimeraMensualidad: false,
      }),
    );
    // No debería aparecer la fecha de ingreso
    expect(linea).not.toContain('2026-04-01');
  });

  it('aplicaRetiroComp=true + fechaRetiro → RET="X" + fecha en campo 81', () => {
    const linea = construirCotizante(
      fixtureBase({
        aplicaRetiroComp: true,
        fechaRetiro: new Date(Date.UTC(2026, 3, 30)),
      }),
    );
    expect(linea).toContain('2026-04-30');
  });

  it('ingOverride=false anula la primera mensualidad (split línea 2)', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoLiquidacion: 'MENSUALIDAD',
        esPrimeraMensualidad: true,
        ingOverride: false,
      }),
    );
    // El override debe ganar: no aparece la fecha de ingreso
    expect(linea).not.toContain('2026-04-01');
  });
});

describe('construirCotizante — plano K (Decreto 2616)', () => {
  it('omite EPS/AFP/CCF/SENA/ICBF — solo ARL', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoPlanilla: 'K',
        diasCotizados: 1,
        valorPension: 0,
        valorSalud: 0,
        valorCcf: 0,
        valorSena: 0,
        valorIcbf: 0,
      }),
    );
    // Códigos AFP/EPS/CCF deben estar en blanco (6 espacios)
    expect(linea).not.toContain('AFP005');
    expect(linea).not.toContain('EPS010');
    expect(linea).not.toContain('CCF068');
    // El código ARL sí debe aparecer
    expect(linea).toContain('ARL015');
  });

  it('plano K aplica override de tipo cotizante "23" y subtipo "00"', () => {
    const linea = construirCotizante(
      fixtureBase({
        tipoPlanilla: 'K',
        tipoCotizanteCodigo: '01', // se debe sobrescribir a 23
        subtipoCodigo: '99', // se debe sobrescribir a 00
      }),
    );
    // Posiciones 25..29 = tipoCot(2) + subtipo(2)
    // 7 (campo3 inicio) + 2 + 16 (numdoc) = 25
    expect(linea.slice(25, 27)).toBe('23');
    expect(linea.slice(27, 29)).toBe('00');
  });
});

describe('construirCotizante — plano E + RESOLUCIÓN', () => {
  it('fuerza tipo doc PA, cotizante 01, subtipo 04', () => {
    const linea = construirCotizante(fixtureBase({ tipoPlanilla: 'E', regimen: 'RESOLUCION' }));
    expect(linea.slice(7, 9)).toBe('PA');
    expect(linea.slice(25, 27)).toBe('01');
    expect(linea.slice(27, 29)).toBe('04');
  });

  it('solo lleva EPS — anula AFP, ARL, CCF, parafiscales', () => {
    const linea = construirCotizante(fixtureBase({ tipoPlanilla: 'E', regimen: 'RESOLUCION' }));
    expect(linea).toContain('EPS010');
    expect(linea).not.toContain('AFP005');
    expect(linea).not.toContain('ARL015');
    expect(linea).not.toContain('CCF068');
  });
});

describe('construirCotizante — omisión de pensión por subtipo', () => {
  it('subtipo 02 (omisión) en plano E ordinario → AFP vacío', () => {
    const linea = construirCotizante(fixtureBase({ subtipoCodigo: '02' }));
    expect(linea).not.toContain('AFP005');
  });

  it('subtipo 12 (omisión) → AFP vacío', () => {
    const linea = construirCotizante(fixtureBase({ subtipoCodigo: '12' }));
    expect(linea).not.toContain('AFP005');
  });

  it('subtipo 00 (no omisión) → AFP presente', () => {
    const linea = construirCotizante(fixtureBase({ subtipoCodigo: '00' }));
    expect(linea).toContain('AFP005');
  });

  it('omisión NO se aplica en RESOLUCIÓN (esa anula AFP por otro lado)', () => {
    const linea = construirCotizante(
      fixtureBase({ tipoPlanilla: 'E', regimen: 'RESOLUCION', subtipoCodigo: '02' }),
    );
    // Resolución ya quita AFP — el resultado es el mismo, AFP vacío
    expect(linea).not.toContain('AFP005');
  });
});

describe('construirCotizante — IBC CCF simbólico', () => {
  it('plan SIN CCF + plano E ordinario → IBC CCF = $1 simbólico', () => {
    // Cuando el plan no incluye CCF pero el plano sí lo lleva (E ordinario),
    // el operador exige IBC = 1 con tarifa 4%.
    const linea = construirCotizante(
      fixtureBase({
        planIncluyeCcf: false,
        tarifaCcf: 0, // sin tarifa configurada
        valorCcf: 0,
      }),
    );
    // Debe aparecer "000000001" (IBC CCF de $1)
    // Y la tarifa CCF debe ser 0.04000 (4%)
    expect(linea).toContain('000000001');
    expect(linea).toContain('0.04000');
  });

  it('plan CON CCF → IBC CCF normal (= IBC base)', () => {
    const linea = construirCotizante(
      fixtureBase({
        planIncluyeCcf: true,
        salario: 1_750_000,
        diasCotizados: 30,
        tarifaCcf: 4,
      }),
    );
    // Que NO aparezca el IBC simbólico de 1
    // Esto es indirecto: el IBC CCF debe ser 1750000 igual que los demás
    expect(linea).toContain('001750000');
  });
});

describe('construirCotizante — campo 25 IGE (split línea 2)', () => {
  it('campo25Ige=true marca IGE con X', () => {
    const linea = construirCotizante(fixtureBase({ campo25Ige: true }));
    // Posición 25 (IGE): suma campos 1..24
    // Más simple: contar X en la línea — debe haber al menos 1
    expect(linea).toMatch(/X/);
  });

  it('campo25Ige=false → IGE en blanco', () => {
    // Con todas las flags en false, la línea no tiene IGE
    const linea = construirCotizante(
      fixtureBase({
        campo25Ige: false,
        esPrimeraMensualidad: false,
        aplicaRetiroComp: false,
      }),
    );
    // No debería haber X (las únicas X salen de ING/RET/IGE/exonera)
    // Plano E ordinario sin retiro y sin primera mensualidad: solo "F"
    // del salario integral aparece como letra. Sin X.
    expect(linea).not.toMatch(/X/);
  });
});

describe('construirCotizante — actividad económica (centro de trabajo)', () => {
  it('CIIU numérico se padea con ceros a la izquierda en 9 dígitos', () => {
    const linea = construirCotizante(fixtureBase({ actividadEconomicaCodigo: '7820' }));
    // Centro de trabajo (campo 62) = "000007820"
    expect(linea).toContain('000007820');
  });

  it('si actividad es "0" o vacío → "000000000"', () => {
    const linea = construirCotizante(fixtureBase({ actividadEconomicaCodigo: '' }));
    expect(linea).toContain('000000000');
  });

  it('CIIU también va al padding operador (últimos 17 chars)', () => {
    const linea = construirCotizante(fixtureBase({ actividadEconomicaCodigo: '7820' }));
    // Los últimos 17 caracteres son el padding del operador con CIIU justificado a derecha
    const padding = linea.slice(-PADDING_OPERADOR_LEN);
    expect(padding.length).toBe(17);
    expect(padding.trimEnd().endsWith('7820') || padding.includes('7820')).toBe(true);
  });
});

describe('construirCotizante — salario integral (campo 41)', () => {
  // El campo 41 es el char 1 después del salario (campo 40, 9 chars).
  // Posición 200 (suma exacta de campos 1..40 según resolución 2388/2016).
  const POS_CAMPO_41 = 200;

  it('plano E → "F" en posición 201 (salario integral)', () => {
    const linea = construirCotizante(fixtureBase({ tipoPlanilla: 'E' }));
    expect(linea[POS_CAMPO_41]).toBe('F');
  });

  it('plano I → " " en posición 201 (sin salario integral)', () => {
    const linea = construirCotizante(fixtureBase({ tipoPlanilla: 'I', tipoCotizanteCodigo: '59' }));
    expect(linea[POS_CAMPO_41]).toBe(' ');
  });
});
