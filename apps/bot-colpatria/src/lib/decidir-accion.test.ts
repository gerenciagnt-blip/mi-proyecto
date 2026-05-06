import { describe, it, expect, afterEach } from 'vitest';
import { decidirAccion, reactivarHabilitado } from './decidir-accion.js';

describe('decidirAccion · evento CREAR', () => {
  it('NUEVO → PROCEDER modo CREAR sin warnings', () => {
    const r = decidirAccion({ kind: 'NUEVO' }, 'CREAR');
    expect(r).toEqual({ kind: 'PROCEDER', modo: 'CREAR' });
  });

  it('EXISTE con form pre-cargado → FALLAR no-retryable e incluye id', () => {
    const r = decidirAccion({ kind: 'EXISTE', idOperacion: '987654' }, 'CREAR');
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(false);
      expect(r.mensaje).toContain('987654');
      expect(r.mensaje).toContain('REACTIVAR');
    }
  });

  it('EXISTE con modal "ya vigente" → FALLAR no-retryable', () => {
    const r = decidirAccion({ kind: 'EXISTE', idOperacion: '?' }, 'CREAR');
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(false);
    }
  });

  it('ERROR → FALLAR retryable y propaga el mensaje', () => {
    const r = decidirAccion({ kind: 'ERROR', mensaje: 'sesión expiró' }, 'CREAR');
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(true);
      expect(r.mensaje).toBe('sesión expiró');
    }
  });
});

describe('decidirAccion · evento REACTIVAR (flag habilitado)', () => {
  it('NUEVO → PROCEDER modo CREAR con warning best-effort', () => {
    const r = decidirAccion({ kind: 'NUEVO' }, 'REACTIVAR');
    expect(r.kind).toBe('PROCEDER');
    if (r.kind === 'PROCEDER') {
      expect(r.modo).toBe('CREAR');
      expect(r.warnings?.length).toBeGreaterThan(0);
      expect(r.warnings?.[0]).toMatch(/REACTIVAR.*no.*tenía/i);
    }
  });

  it('EXISTE form pre-cargado → PROCEDER modo REACTIVAR', () => {
    const r = decidirAccion({ kind: 'EXISTE', idOperacion: '12345' }, 'REACTIVAR');
    expect(r.kind).toBe('PROCEDER');
    if (r.kind === 'PROCEDER') {
      expect(r.modo).toBe('REACTIVAR');
      expect(r.warnings).toBeUndefined();
    }
  });

  it('EXISTE con modal "ya vigente" → FALLAR no-retryable', () => {
    const r = decidirAccion({ kind: 'EXISTE', idOperacion: '?' }, 'REACTIVAR');
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(false);
      expect(r.mensaje).toMatch(/vigente/i);
    }
  });

  it('ERROR → FALLAR retryable', () => {
    const r = decidirAccion({ kind: 'ERROR', mensaje: 'timeout' }, 'REACTIVAR');
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(true);
    }
  });
});

describe('decidirAccion · feature flag deshabilitado', () => {
  it('REACTIVAR + flag false → FALLAR no-retryable con mención del flag', () => {
    const r = decidirAccion({ kind: 'EXISTE', idOperacion: '12345' }, 'REACTIVAR', {
      reactivarEnabled: false,
    });
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(false);
      expect(r.mensaje).toMatch(/COLPATRIA_REACTIVAR_ENABLED/);
    }
  });

  it('CREAR + flag false → no afectado, procede normal', () => {
    const r = decidirAccion({ kind: 'NUEVO' }, 'CREAR', { reactivarEnabled: false });
    expect(r.kind).toBe('PROCEDER');
  });

  it('REACTIVAR + flag false + ERROR → FALLAR retryable (ERROR tiene precedencia)', () => {
    const r = decidirAccion({ kind: 'ERROR', mensaje: 'timeout' }, 'REACTIVAR', {
      reactivarEnabled: false,
    });
    expect(r.kind).toBe('FALLAR');
    if (r.kind === 'FALLAR') {
      expect(r.retryable).toBe(true);
    }
  });
});

describe('reactivarHabilitado · lectura de env var', () => {
  const original = process.env.COLPATRIA_REACTIVAR_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.COLPATRIA_REACTIVAR_ENABLED;
    } else {
      process.env.COLPATRIA_REACTIVAR_ENABLED = original;
    }
  });

  it('undefined → true (default)', () => {
    delete process.env.COLPATRIA_REACTIVAR_ENABLED;
    expect(reactivarHabilitado()).toBe(true);
  });

  it('cadena vacía → true (default)', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = '';
    expect(reactivarHabilitado()).toBe(true);
  });

  it('"true" → true', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = 'true';
    expect(reactivarHabilitado()).toBe(true);
  });

  it('"1" → true', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = '1';
    expect(reactivarHabilitado()).toBe(true);
  });

  it('"false" → false', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = 'false';
    expect(reactivarHabilitado()).toBe(false);
  });

  it('"0" → false', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = '0';
    expect(reactivarHabilitado()).toBe(false);
  });

  it('"yes" → false (solo "true"/"1" cuentan)', () => {
    process.env.COLPATRIA_REACTIVAR_ENABLED = 'yes';
    expect(reactivarHabilitado()).toBe(false);
  });
});
