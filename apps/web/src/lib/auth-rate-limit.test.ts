import { describe, it, expect } from 'vitest';
import {
  extraerIpDeHeaders,
  formatearMensajeBloqueo,
  IP_LOCK_WINDOW_MS,
  LOCK_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  MAX_FAILED_BY_IP,
} from './auth-rate-limit';

describe('extraerIpDeHeaders', () => {
  it('devuelve la IP de x-forwarded-for cuando viene una sola', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.45' });
    expect(extraerIpDeHeaders(h)).toBe('203.0.113.45');
  });

  it('toma la PRIMERA IP cuando x-forwarded-for trae varias (cliente, proxy1, proxy2)', () => {
    const h = new Headers({
      'x-forwarded-for': '203.0.113.45, 10.0.0.1, 10.0.0.2',
    });
    expect(extraerIpDeHeaders(h)).toBe('203.0.113.45');
  });

  it('respeta espacios alrededor de la IP', () => {
    const h = new Headers({
      'x-forwarded-for': '   203.0.113.45  ,  10.0.0.1',
    });
    expect(extraerIpDeHeaders(h)).toBe('203.0.113.45');
  });

  it('cae a x-real-ip cuando no hay x-forwarded-for', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.7' });
    expect(extraerIpDeHeaders(h)).toBe('198.51.100.7');
  });

  it('cae a x-real-ip cuando x-forwarded-for está vacío', () => {
    const h = new Headers({
      'x-forwarded-for': '',
      'x-real-ip': '198.51.100.7',
    });
    expect(extraerIpDeHeaders(h)).toBe('198.51.100.7');
  });

  it('cae a x-real-ip cuando x-forwarded-for trae solo coma', () => {
    const h = new Headers({
      'x-forwarded-for': ',',
      'x-real-ip': '198.51.100.7',
    });
    expect(extraerIpDeHeaders(h)).toBe('198.51.100.7');
  });

  it('devuelve null cuando ningún header está presente', () => {
    const h = new Headers();
    expect(extraerIpDeHeaders(h)).toBeNull();
  });

  it('prioriza x-forwarded-for sobre x-real-ip cuando ambos vienen', () => {
    const h = new Headers({
      'x-forwarded-for': '203.0.113.45',
      'x-real-ip': '198.51.100.7',
    });
    expect(extraerIpDeHeaders(h)).toBe('203.0.113.45');
  });

  it('soporta IPv6 en x-forwarded-for', () => {
    const h = new Headers({
      'x-forwarded-for': '2001:db8::1',
    });
    expect(extraerIpDeHeaders(h)).toBe('2001:db8::1');
  });
});

describe('formatearMensajeBloqueo', () => {
  it('mensaje cuando el desbloqueo es a futuro (1 minuto)', () => {
    const en = new Date(Date.now() + 30 * 1000);
    expect(formatearMensajeBloqueo(en)).toMatch(/1 minuto/);
  });

  it('mensaje cuando faltan varios minutos (plural)', () => {
    const en = new Date(Date.now() + 5 * 60 * 1000);
    expect(formatearMensajeBloqueo(en)).toMatch(/5 minutos/);
  });

  it('mensaje "puedes intentar nuevamente" cuando ya pasó', () => {
    const en = new Date(Date.now() - 1000);
    expect(formatearMensajeBloqueo(en)).toMatch(/intentar nuevamente/i);
  });
});

describe('configuración de umbrales', () => {
  it('bucket por email es más estricto que el de IP', () => {
    expect(MAX_FAILED_ATTEMPTS).toBeLessThan(MAX_FAILED_BY_IP);
    expect(LOCK_WINDOW_MS).toBeLessThanOrEqual(IP_LOCK_WINDOW_MS);
  });

  it('umbrales razonables (no 0 ni absurdamente altos)', () => {
    expect(MAX_FAILED_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_FAILED_ATTEMPTS).toBeLessThan(20);
    expect(MAX_FAILED_BY_IP).toBeGreaterThan(MAX_FAILED_ATTEMPTS);
    expect(MAX_FAILED_BY_IP).toBeLessThan(1000);
  });
});
