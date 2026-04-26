-- Sequences atómicas para los consecutivos de catálogos: Empresa CC,
-- Asesor Comercial y Servicio Adicional.
--
-- Antes usábamos `findFirst+max+1` (no atómico). Funcionaba porque el
-- volumen es bajo, pero con concurrencia real puede haber race conditions
-- y colisiones por el `@@unique`. Las sequences de Postgres son atómicas
-- por diseño y no requieren ningún lock.
--
-- Setup: cada sequence arranca desde el siguiente número disponible según
-- los registros existentes (padding de seguridad de +1 para evitar
-- colisión con un código que se acabe de crear con el método viejo).
--
-- Operación NO destructiva: solo crea sequences. El código viejo
-- (findFirst+max+1) sigue funcionando hasta que se actualice a usar
-- `nextval()`.

-- ============ Empresa CC: prefijo CCB- (6 dígitos) ============
DO $$
DECLARE
  v_max INT := 0;
BEGIN
  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(codigo, '^CCB-', ''), '')::INT), 0)
  INTO v_max
  FROM cuentas_cobro
  WHERE codigo ~ '^CCB-\d+$';

  EXECUTE FORMAT(
    'CREATE SEQUENCE IF NOT EXISTS cuenta_cobro_consecutivo_seq START WITH %s',
    v_max + 1
  );
END $$;

-- ============ Asesor Comercial: prefijo AS- (4 dígitos) ============
DO $$
DECLARE
  v_max INT := 0;
BEGIN
  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(codigo, '^AS-', ''), '')::INT), 0)
  INTO v_max
  FROM asesores_comerciales
  WHERE codigo ~ '^AS-\d+$';

  EXECUTE FORMAT(
    'CREATE SEQUENCE IF NOT EXISTS asesor_consecutivo_seq START WITH %s',
    v_max + 1
  );
END $$;

-- ============ Servicio Adicional: prefijo SRV- (4 dígitos) ============
DO $$
DECLARE
  v_max INT := 0;
BEGIN
  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(codigo, '^SRV-', ''), '')::INT), 0)
  INTO v_max
  FROM servicios_adicionales
  WHERE codigo ~ '^SRV-\d+$';

  EXECUTE FORMAT(
    'CREATE SEQUENCE IF NOT EXISTS servicio_adicional_consecutivo_seq START WITH %s',
    v_max + 1
  );
END $$;
