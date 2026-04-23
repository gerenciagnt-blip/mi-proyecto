-- Quita el @unique en comprobanteId de planillas_comprobantes.
-- Motivo: un comprobante de afiliación con plan de resolución EPS+ARL
-- debe enlazarse a DOS planillas (tipo E y tipo K) simultáneamente.
-- El @@id([planillaId, comprobanteId]) sigue siendo la llave primaria,
-- que evita duplicados dentro de la misma planilla.

DROP INDEX IF EXISTS "planillas_comprobantes_comprobanteId_key";
