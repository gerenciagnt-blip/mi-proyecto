import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  mapearTipoDocumento,
  mapearGenero,
  validarPayloadParaIngreso,
  prepararCamposIngreso,
  calcularFechaIngresoAxa,
  type ColpatriaPayload,
  type ConfigResuelta,
} from './payload-form.js';

// Fijar la fecha "hoy" para que `calcularFechaIngresoAxa()` sea
// determinista en los tests. Hoy = 2026-04-27 → mañana = 2026-04-28.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

// ============================================================================
// Fixtures
// ============================================================================

const payloadBase: ColpatriaPayload = {
  schemaVersion: 1,
  evento: 'CREAR',
  afiliacion: {
    id: 'af1',
    estado: 'ACTIVA',
    modalidad: 'DEPENDIENTE',
    nivelRiesgo: 'III',
    salario: '2500000.00',
    // Coincide con "mañana" del clock fijado → sin warning de fecha
    fechaIngreso: '2026-04-28',
    cargo: 'Operario',
    epsCodigoAxa: '1',
    afpCodigoAxa: '5',
    cotizante: {
      id: 'cot1',
      tipoDocumento: 'CC',
      numeroDocumento: '1234567890',
      primerNombre: 'Juan',
      segundoNombre: 'Carlos',
      primerApellido: 'Pérez',
      segundoApellido: 'Gómez',
      fechaNacimiento: '1990-08-20',
      genero: 'M',
      estadoCivil: '2',
      email: 'juan@example.com',
      celular: '3001234567',
      direccion: 'Calle 123 #45-67',
      municipio: 'BOGOTÁ D.C.',
      departamento: 'BOGOTA D. C.',
    },
    empresa: { id: 'e1', nit: '901926124', nombre: 'Ecoagropecuaria SAS' },
  },
};

const configBase: ConfigResuelta = {
  aplicacion: 'ARP',
  perfil: 'OPE',
  empresaIdInterno: '104143',
  afiliacionId: '9039956',
  nitEmpresaMision: '901926124',
  codigoSucursal: '01',
  codigoCentroTrabajo: '03',
  tipoAfiliacion: '1',
  grupoOcupacion: '86',
  tipoOcupacion: '7631',
  tipoSalario: '1',
  modalidadTrabajo: '01',
  tareaAltoRiesgo: '0000001',
};

// ============================================================================
// mapearTipoDocumento
// ============================================================================

describe('mapearTipoDocumento', () => {
  it.each([
    ['CC', '1'],
    ['NIT', '2'],
    ['TI', '3'],
    ['CE', '4'],
    ['PAS', '5'],
  ])('mapea %s → %s', (pila, axa) => {
    expect(mapearTipoDocumento(pila)).toBe(axa);
  });

  it('tira para RC (sin equivalente AXA)', () => {
    expect(() => mapearTipoDocumento('RC')).toThrow(/no tiene equivalente/);
  });

  it('tira para NIP (sin equivalente AXA)', () => {
    expect(() => mapearTipoDocumento('NIP')).toThrow(/no tiene equivalente/);
  });

  it('tira con string vacío', () => {
    expect(() => mapearTipoDocumento('')).toThrow(/no tiene equivalente/);
  });
});

// ============================================================================
// mapearGenero
// ============================================================================

describe('mapearGenero', () => {
  it('M → M sin warning', () => {
    const w: string[] = [];
    expect(mapearGenero('M', w)).toBe('M');
    expect(w).toHaveLength(0);
  });

  it('F → F sin warning', () => {
    const w: string[] = [];
    expect(mapearGenero('F', w)).toBe('F');
    expect(w).toHaveLength(0);
  });

  it('O → fallback M con warning', () => {
    const w: string[] = [];
    expect(mapearGenero('O', w)).toBe('M');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('"O"');
  });

  it('null → fallback M con warning', () => {
    const w: string[] = [];
    expect(mapearGenero(null, w)).toBe('M');
    expect(w).toHaveLength(1);
  });
});

// ============================================================================
// validarPayloadParaIngreso
// ============================================================================

describe('validarPayloadParaIngreso', () => {
  it('payload completo → sin errores', () => {
    expect(validarPayloadParaIngreso(payloadBase)).toEqual([]);
  });

  it('cargo vacío → error', () => {
    const p = { ...payloadBase, afiliacion: { ...payloadBase.afiliacion, cargo: null } };
    const errs = validarPayloadParaIngreso(p);
    expect(errs.some((e) => e.toLowerCase().includes('cargo'))).toBe(true);
  });

  it('cargo "  " (solo espacios) → error', () => {
    const p = { ...payloadBase, afiliacion: { ...payloadBase.afiliacion, cargo: '   ' } };
    const errs = validarPayloadParaIngreso(p);
    expect(errs.some((e) => e.toLowerCase().includes('cargo'))).toBe(true);
  });

  it('sin email → error', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, email: null },
      },
    };
    expect(validarPayloadParaIngreso(p)).toContain('Email es requerido por AXA pero está vacío');
  });

  it('sin dirección → error', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, direccion: null },
      },
    };
    expect(validarPayloadParaIngreso(p).some((e) => e.toLowerCase().includes('dirección'))).toBe(
      true,
    );
  });

  it('sin celular → error', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, celular: null },
      },
    };
    const errs = validarPayloadParaIngreso(p);
    expect(errs.some((e) => e.toLowerCase().includes('celular'))).toBe(true);
  });

  it('tipoDocumento RC → error', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, tipoDocumento: 'RC' },
      },
    };
    expect(validarPayloadParaIngreso(p).some((e) => e.includes('RC'))).toBe(true);
  });
});

// ============================================================================
// prepararCamposIngreso
// ============================================================================

describe('prepararCamposIngreso', () => {
  it('payload + config completos → output completo sin warnings', () => {
    const r = prepararCamposIngreso(payloadBase, configBase);
    expect(r.warnings).toEqual([]);

    expect(r.consulta).toEqual({ tipoIdentificacion: '1', documento: '1234567890' });

    expect(r.personales).toEqual({
      primerNombre: 'Juan',
      segundoNombre: 'Carlos',
      primerApellido: 'Pérez',
      segundoApellido: 'Gómez',
      fechaNacimiento: '20/08/1990',
      genero: 'M',
      estadoCivil: '2',
    });

    expect(r.domicilio).toEqual({
      direccion: 'Calle 123 #45-67',
      telefono: '3001234567', // fallback al celular si no hay teléfono
      celular: '3001234567',
      email: 'juan@example.com',
      departamentoNombre: 'BOGOTA D. C.',
      ciudadNombre: 'BOGOTÁ D.C.',
    });

    // fechaIngreso siempre se calcula como mañana (today+1) en el AXA.
    // El payload base tiene 2026-04-28 que matchea con el clock fijado
    // → no genera warning. Si la fecha PILA difiriera, vendría warning.
    expect(r.laborales).toEqual({
      fechaIngreso: '28/04/2026',
      tipoSalario: '1',
      valorSalario: '2500000',
      cargo: 'Operario',
      nitEmpresaMision: '901926124',
      codigoSucursal: '01',
      codigoCentroTrabajo: '03',
      tipoAfiliacion: '1',
      grupoOcupacion: '86',
      tipoOcupacion: '7631',
      modalidadTrabajo: '01',
      tareaAltoRiesgo: '0000001',
      epsCodigoAxa: '1',
      afpCodigoAxa: '5',
    });

    expect(r.jornada).toEqual({ completa: true });
  });

  it('fechaIngreso AXA: si PILA es PASADA → usa mañana + warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, fechaIngreso: '2026-01-15' },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.fechaIngreso).toBe('28/04/2026'); // mañana
    expect(r.warnings.some((w) => w.includes('ajustada a 28/04/2026'))).toBe(true);
  });

  it('fechaIngreso AXA: si PILA = HOY → usa mañana + warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, fechaIngreso: '2026-04-27' }, // hoy
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.fechaIngreso).toBe('28/04/2026'); // mañana
    expect(r.warnings.some((w) => w.includes('ajustada'))).toBe(true);
  });

  it('fechaIngreso AXA: si PILA = MAÑANA → usa PILA, sin warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, fechaIngreso: '2026-04-28' }, // mañana
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.fechaIngreso).toBe('28/04/2026');
    expect(r.warnings.some((w) => w.includes('Fecha de ingreso PILA'))).toBe(false);
  });

  it('fechaIngreso AXA: si PILA = FUTURO (5 días) → usa PILA, sin warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, fechaIngreso: '2026-05-02' }, // +5 días
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.fechaIngreso).toBe('02/05/2026');
    expect(r.warnings.some((w) => w.includes('Fecha de ingreso PILA'))).toBe(false);
  });

  it('calcularFechaIngresoAxa: regla today+1 vs PILA', () => {
    const hoy = new Date('2026-04-27T12:00:00Z');
    // Sin PILA → siempre mañana
    expect(calcularFechaIngresoAxa(hoy)).toBe('28/04/2026');
    // PILA pasado → mañana
    expect(calcularFechaIngresoAxa(hoy, '2026-01-15')).toBe('28/04/2026');
    // PILA hoy → mañana
    expect(calcularFechaIngresoAxa(hoy, '2026-04-27')).toBe('28/04/2026');
    // PILA mañana → PILA
    expect(calcularFechaIngresoAxa(hoy, '2026-04-28')).toBe('28/04/2026');
    // PILA futuro → PILA
    expect(calcularFechaIngresoAxa(hoy, '2026-05-02')).toBe('02/05/2026');
    // Cambio de mes
    expect(calcularFechaIngresoAxa(new Date('2026-04-30T12:00:00Z'))).toBe('01/05/2026');
    // Cambio de año
    expect(calcularFechaIngresoAxa(new Date('2025-12-31T12:00:00Z'))).toBe('01/01/2026');
    // PILA con formato malformado → fallback a mañana
    expect(calcularFechaIngresoAxa(hoy, 'no-fecha')).toBe('28/04/2026');
  });

  it('formatea salario sin decimales (2500000.99 → "2500001" redondeo)', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, salario: '2500000.99' },
    };
    expect(prepararCamposIngreso(p, configBase).laborales.valorSalario).toBe('2500001');
  });

  it('estadoCivil null → null en personales', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, estadoCivil: null },
      },
    };
    expect(prepararCamposIngreso(p, configBase).personales.estadoCivil).toBeNull();
  });

  it('género O → genera warning + fallback M', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: { ...payloadBase.afiliacion.cotizante, genero: 'O' },
      },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.personales.genero).toBe('M');
    expect(r.warnings.length).toBe(1);
  });

  it('nombre largo (>15) → trunca + warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: {
          ...payloadBase.afiliacion.cotizante,
          primerNombre: 'María Esperanza Cristina',
        },
      },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.personales.primerNombre.length).toBe(15);
    expect(r.personales.primerNombre).toBe('María Esperanza');
    expect(r.warnings.some((w) => w.includes('PrimerNombre'))).toBe(true);
  });

  it('cargo largo (>30) → trunca + warning', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cargo: 'Asesor Comercial Senior de la Región Pacífico Sur',
      },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.cargo.length).toBe(30);
    expect(r.warnings.some((w) => w.includes('Cargo'))).toBe(true);
  });

  it('telefono y celular en output usan ambos el celular del payload', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        cotizante: {
          ...payloadBase.afiliacion.cotizante,
          celular: '3001234567',
        },
      },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.domicilio.telefono).toBe('3001234567');
    expect(r.domicilio.celular).toBe('3001234567');
  });

  it('codigoCentroTrabajo null en config → null en output (caller decide qué hacer)', () => {
    const r = prepararCamposIngreso(payloadBase, { ...configBase, codigoCentroTrabajo: null });
    expect(r.laborales.codigoCentroTrabajo).toBeNull();
  });

  it('quemados de config siempre se respetan (no los puede pisar el payload)', () => {
    const r = prepararCamposIngreso(payloadBase, configBase);
    expect(r.laborales.tipoSalario).toBe('1');
    expect(r.laborales.modalidadTrabajo).toBe('01');
    expect(r.laborales.tareaAltoRiesgo).toBe('0000001');
  });

  it('eps/afp codigos AXA del payload se arrastran a laborales', () => {
    const r = prepararCamposIngreso(payloadBase, configBase);
    expect(r.laborales.epsCodigoAxa).toBe('1');
    expect(r.laborales.afpCodigoAxa).toBe('5');
    expect(r.warnings).toEqual([]);
  });

  it('eps/afp codigos AXA null → warning + null en output', () => {
    const p = {
      ...payloadBase,
      afiliacion: {
        ...payloadBase.afiliacion,
        epsCodigoAxa: null,
        afpCodigoAxa: null,
      },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.epsCodigoAxa).toBeNull();
    expect(r.laborales.afpCodigoAxa).toBeNull();
    expect(r.warnings.some((w) => w.includes('EPS sin código AXA'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('AFP sin código AXA'))).toBe(true);
  });

  it('eps codigo AXA presente pero afp null → solo warning AFP', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, epsCodigoAxa: '1', afpCodigoAxa: null },
    };
    const r = prepararCamposIngreso(p, configBase);
    expect(r.laborales.epsCodigoAxa).toBe('1');
    expect(r.laborales.afpCodigoAxa).toBeNull();
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('AFP');
  });

  it('jornada.completa siempre true (default razonable)', () => {
    expect(prepararCamposIngreso(payloadBase, configBase).jornada.completa).toBe(true);
  });

  it('fecha ISO inválida → tira', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, fechaIngreso: 'no-es-fecha' },
    };
    expect(() => prepararCamposIngreso(p, configBase)).toThrow(/Fecha ISO inválida/);
  });

  it('salario negativo → tira', () => {
    const p = {
      ...payloadBase,
      afiliacion: { ...payloadBase.afiliacion, salario: '-100' },
    };
    expect(() => prepararCamposIngreso(p, configBase)).toThrow(/Salario inválido/);
  });
});
