import { describe, it, expect } from 'vitest';
import {
  resolverConfigParaAfiliacion,
  validarConfigCompleta,
  COLPATRIA_HARDCODED,
  type EmpresaConfigSnapshot,
} from './config-resolver';

const snapshotCompleto: EmpresaConfigSnapshot = {
  nit: '900123456',
  colpatriaAplicacion: 'ARP',
  colpatriaPerfil: 'OFI',
  colpatriaEmpresaIdInterno: '105787',
  colpatriaAfiliacionId: '9048054',
  colpatriaCodigoSucursalDefault: '01',
  colpatriaTipoAfiliacionDefault: '1',
  colpatriaGrupoOcupacionDefault: '86',
  colpatriaTipoOcupacionDefault: '7631',
  nivelesCentros: [
    { nivel: 'I', codigoCentroTrabajo: '03', grupoOcupacion: '255', tipoOcupacion: '4321' },
    { nivel: 'II', codigoCentroTrabajo: '01', grupoOcupacion: null, tipoOcupacion: null },
    { nivel: 'III', codigoCentroTrabajo: null, grupoOcupacion: '86', tipoOcupacion: null },
    { nivel: 'V', codigoCentroTrabajo: '99', grupoOcupacion: '317', tipoOcupacion: '6111' },
  ],
};

describe('validarConfigCompleta', () => {
  it('snapshot completo → sin errores', () => {
    expect(validarConfigCompleta(snapshotCompleto)).toEqual([]);
  });

  it('falta usuario AXA → error específico', () => {
    expect(
      validarConfigCompleta({ ...snapshotCompleto, colpatriaEmpresaIdInterno: null }),
    ).toContain('Falta ID interno de empresa AXA (option value de #ddlEmpresas)');
  });

  it('falta varias cosas → varios errores', () => {
    const errores = validarConfigCompleta({
      ...snapshotCompleto,
      colpatriaTipoAfiliacionDefault: null,
      colpatriaGrupoOcupacionDefault: null,
      colpatriaCodigoSucursalDefault: null,
    });
    expect(errores.length).toBeGreaterThanOrEqual(3);
    expect(errores.some((e) => e.includes('Tipo de Afiliación'))).toBe(true);
    expect(errores.some((e) => e.includes('Grupo de Ocupación'))).toBe(true);
    expect(errores.some((e) => e.includes('Sucursal'))).toBe(true);
  });
});

describe('resolverConfigParaAfiliacion — Centro de Trabajo', () => {
  it('mapea nivel I → centro 03 (mapeo explícito)', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'I');
    expect(r.codigoCentroTrabajo).toBe('03');
  });

  it('mapeo con codigoCentroTrabajo null → cae al default sucursal', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'III');
    expect(r.codigoCentroTrabajo).toBe('01'); // default sucursal
  });

  it('nivel sin entrada (IV) → cae al default sucursal', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'IV');
    expect(r.codigoCentroTrabajo).toBe('01');
  });
});

describe('resolverConfigParaAfiliacion — Grupo y Tipo de Ocupación (Opción B)', () => {
  it('nivel I tiene grupo+tipo override → usa esos', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'I');
    expect(r.grupoOcupacion).toBe('255');
    expect(r.tipoOcupacion).toBe('4321');
  });

  it('nivel II tiene grupo null → ambos caen al default empresa', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'II');
    expect(r.grupoOcupacion).toBe('86'); // default empresa
    expect(r.tipoOcupacion).toBe('7631'); // default empresa
  });

  it('nivel III tiene grupo override pero tipo null → grupo override + tipo default', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'III');
    expect(r.grupoOcupacion).toBe('86'); // del nivel
    expect(r.tipoOcupacion).toBe('7631'); // default empresa (porque el nivel III tiene tipo null)
  });

  it('nivel sin entrada (IV) → ambos caen al default empresa', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'IV');
    expect(r.grupoOcupacion).toBe('86');
    expect(r.tipoOcupacion).toBe('7631');
  });

  it('nivel V tiene ambos override → usa esos', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'V');
    expect(r.grupoOcupacion).toBe('317');
    expect(r.tipoOcupacion).toBe('6111');
  });
});

describe('resolverConfigParaAfiliacion — quemados y básicos', () => {
  it('valores quemados: tipoSalario / modalidadTrabajo / tareaAltoRiesgo', () => {
    for (const n of ['I', 'II', 'III', 'IV', 'V'] as const) {
      const r = resolverConfigParaAfiliacion(snapshotCompleto, n);
      expect(r.tipoSalario).toBe('1');
      expect(r.modalidadTrabajo).toBe('01');
      expect(r.tareaAltoRiesgo).toBe('0000001');
    }
  });

  it('expone los hardcoded como constantes', () => {
    expect(COLPATRIA_HARDCODED.tipoSalario).toBe('1');
    expect(COLPATRIA_HARDCODED.modalidadTrabajo).toBe('01');
    expect(COLPATRIA_HARDCODED.tareaAltoRiesgo).toBe('0000001');
  });

  it('nitEmpresaMision = nit de la propia empresa (caso típico)', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'II');
    expect(r.nitEmpresaMision).toBe('900123456');
  });

  it('snapshot incompleto → throw', () => {
    expect(() =>
      resolverConfigParaAfiliacion({ ...snapshotCompleto, colpatriaEmpresaIdInterno: null }, 'II'),
    ).toThrow(/Config incompleta/);
  });

  it('arrastra todos los defaults configurables al output', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'II');
    expect(r.aplicacion).toBe('ARP');
    expect(r.perfil).toBe('OFI');
    expect(r.empresaIdInterno).toBe('105787');
    expect(r.afiliacionId).toBe('9048054');
    expect(r.tipoAfiliacion).toBe('1');
  });
});
