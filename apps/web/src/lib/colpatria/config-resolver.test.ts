import { describe, it, expect } from 'vitest';
import {
  resolverConfigParaAfiliacion,
  validarConfigCompleta,
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
  colpatriaGrupoOcupacionDefault: 'GRP1',
  colpatriaTipoOcupacionDefault: 'TPO1',
  colpatriaModalidadTrabajoDefault: 'MOD1',
  nivelesCentros: [
    { nivel: 'I', codigoCentroTrabajo: '03' },
    { nivel: 'II', codigoCentroTrabajo: '01' },
    { nivel: 'III', codigoCentroTrabajo: null },
    { nivel: 'V', codigoCentroTrabajo: '99' },
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

describe('resolverConfigParaAfiliacion', () => {
  it('mapea nivel I → centro 03 (mapeo explícito)', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'I');
    expect(r.codigoCentroTrabajo).toBe('03');
  });

  it('mapea nivel II → centro 01', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'II');
    expect(r.codigoCentroTrabajo).toBe('01');
  });

  it('mapeo con codigoCentroTrabajo null → cae al default sucursal', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'III');
    expect(r.codigoCentroTrabajo).toBe('01'); // default sucursal
  });

  it('nivel sin mapeo (IV) → cae al default sucursal', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'IV');
    expect(r.codigoCentroTrabajo).toBe('01');
  });

  it('nivel V → tareaAltoRiesgo = S', () => {
    expect(resolverConfigParaAfiliacion(snapshotCompleto, 'V').tareaAltoRiesgo).toBe('S');
  });

  it('niveles I–IV → tareaAltoRiesgo = N', () => {
    for (const n of ['I', 'II', 'III', 'IV'] as const) {
      expect(resolverConfigParaAfiliacion(snapshotCompleto, n).tareaAltoRiesgo).toBe('N');
    }
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

  it('arrastra todos los defaults al output', () => {
    const r = resolverConfigParaAfiliacion(snapshotCompleto, 'II');
    expect(r.aplicacion).toBe('ARP');
    expect(r.perfil).toBe('OFI');
    expect(r.empresaIdInterno).toBe('105787');
    expect(r.afiliacionId).toBe('9048054');
    expect(r.tipoAfiliacion).toBe('1');
    expect(r.grupoOcupacion).toBe('GRP1');
    expect(r.tipoOcupacion).toBe('TPO1');
    expect(r.modalidadTrabajo).toBe('MOD1');
  });
});
