-- Secuencia atómica para el consecutivo de planillas (mismo patrón que
-- comprobante_consecutivo_seq). Se consume desde Node con:
--   SELECT nextval('planilla_consecutivo_seq')
-- y se formatea como "PLN-000001".

CREATE SEQUENCE IF NOT EXISTS planilla_consecutivo_seq
  AS BIGINT
  START 1
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;
