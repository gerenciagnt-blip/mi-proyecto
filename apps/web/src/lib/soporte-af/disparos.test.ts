import { describe, it, expect } from 'vitest';
import { detectarDisparos, type AfiliacionSnapshot } from './disparos';

/**
 * Tests de la lógica de disparos de Soporte · Afiliaciones.
 * La regla fundamental: solo dispara si el estado final es ACTIVA.
 */

const baseActiva: AfiliacionSnapshot = {
  estado: 'ACTIVA',
  fechaIngreso: '2026-01-15',
  empresaId: 'emp-1',
  nivelRiesgo: 'I',
  planSgssId: 'plan-1',
};

describe('detectarDisparos', () => {
  describe('CREATE (antes=null)', () => {
    it('crea NUEVA si estado final es ACTIVA', () => {
      expect(detectarDisparos(null, baseActiva)).toEqual(['NUEVA']);
    });

    it('no dispara si crea INACTIVA', () => {
      expect(detectarDisparos(null, { ...baseActiva, estado: 'INACTIVA' })).toEqual([]);
    });
  });

  describe('UPDATE estado final INACTIVA (no dispara)', () => {
    it('no dispara aunque cambien otros campos si queda INACTIVA', () => {
      const antes = baseActiva;
      const despues: AfiliacionSnapshot = {
        ...baseActiva,
        estado: 'INACTIVA',
        empresaId: 'emp-2',
        nivelRiesgo: 'III',
      };
      expect(detectarDisparos(antes, despues)).toEqual([]);
    });
  });

  describe('UPDATE INACTIVA → ACTIVA', () => {
    it('REACTIVACION sin más cambios', () => {
      const antes: AfiliacionSnapshot = { ...baseActiva, estado: 'INACTIVA' };
      const despues = baseActiva;
      expect(detectarDisparos(antes, despues)).toEqual(['REACTIVACION']);
    });

    it('REACTIVACION + CAMBIO_EMPRESA si además cambia empresa', () => {
      const antes: AfiliacionSnapshot = {
        ...baseActiva,
        estado: 'INACTIVA',
        empresaId: 'emp-1',
      };
      const despues: AfiliacionSnapshot = { ...baseActiva, empresaId: 'emp-2' };
      expect(detectarDisparos(antes, despues)).toEqual(['REACTIVACION', 'CAMBIO_EMPRESA']);
    });
  });

  describe('UPDATE ACTIVA → ACTIVA con cambios', () => {
    it('sin cambios → no dispara', () => {
      expect(detectarDisparos(baseActiva, baseActiva)).toEqual([]);
    });

    it('cambia fechaIngreso → CAMBIO_FECHA_INGRESO', () => {
      const despues = { ...baseActiva, fechaIngreso: '2026-03-01' };
      expect(detectarDisparos(baseActiva, despues)).toEqual(['CAMBIO_FECHA_INGRESO']);
    });

    it('cambia empresaId → CAMBIO_EMPRESA', () => {
      const despues = { ...baseActiva, empresaId: 'emp-2' };
      expect(detectarDisparos(baseActiva, despues)).toEqual(['CAMBIO_EMPRESA']);
    });

    it('cambia nivelRiesgo → CAMBIO_NIVEL_ARL', () => {
      const despues = { ...baseActiva, nivelRiesgo: 'V' };
      expect(detectarDisparos(baseActiva, despues)).toEqual(['CAMBIO_NIVEL_ARL']);
    });

    it('cambia planSgssId → CAMBIO_PLAN_SGSS', () => {
      const despues = { ...baseActiva, planSgssId: 'plan-2' };
      expect(detectarDisparos(baseActiva, despues)).toEqual(['CAMBIO_PLAN_SGSS']);
    });

    it('varios cambios simultáneos → múltiples disparos en orden', () => {
      const despues: AfiliacionSnapshot = {
        ...baseActiva,
        fechaIngreso: '2026-06-01',
        empresaId: 'emp-2',
        nivelRiesgo: 'III',
        planSgssId: 'plan-2',
      };
      expect(detectarDisparos(baseActiva, despues)).toEqual([
        'CAMBIO_FECHA_INGRESO',
        'CAMBIO_EMPRESA',
        'CAMBIO_NIVEL_ARL',
        'CAMBIO_PLAN_SGSS',
      ]);
    });
  });

  describe('null safety', () => {
    it('maneja empresaId null → null (no dispara CAMBIO_EMPRESA)', () => {
      const antes = { ...baseActiva, empresaId: null };
      const despues = { ...baseActiva, empresaId: null };
      expect(detectarDisparos(antes, despues)).toEqual([]);
    });

    it('maneja empresaId null → "emp-1" (sí dispara)', () => {
      const antes = { ...baseActiva, empresaId: null };
      const despues = { ...baseActiva, empresaId: 'emp-1' };
      expect(detectarDisparos(antes, despues)).toEqual(['CAMBIO_EMPRESA']);
    });

    it('maneja planSgssId "plan-1" → null (sí dispara)', () => {
      const antes = { ...baseActiva, planSgssId: 'plan-1' };
      const despues = { ...baseActiva, planSgssId: null };
      expect(detectarDisparos(antes, despues)).toEqual(['CAMBIO_PLAN_SGSS']);
    });
  });
});
