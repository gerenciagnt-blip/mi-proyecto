-- Secuencia atómica para el consecutivo de comprobantes.
--
-- Resuelve la race condition de nextComprobanteConsecutivo() cuando dos
-- admins procesan al mismo tiempo: la lectura del "máximo" + escritura
-- no era atómica. `nextval()` en Postgres sí lo es.

CREATE SEQUENCE IF NOT EXISTS comprobante_consecutivo_seq
  AS BIGINT
  START 1
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Sembrar la secuencia con el último consecutivo existente (si hay).
-- El parseo toma los dígitos después de "CMP-". Si aún no hay comprobantes
-- queda en 1, que es el START default.
DO $$
DECLARE
  max_n BIGINT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(consecutivo FROM 'CMP-(\d+)$') AS BIGINT)),
    0
  )
  INTO max_n
  FROM comprobantes
  WHERE consecutivo ~ '^CMP-\d+$';

  IF max_n > 0 THEN
    PERFORM setval('comprobante_consecutivo_seq', max_n, true);
  END IF;
END $$;
