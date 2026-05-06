-- Limpieza de campos @deprecated del esquema Colpatria.
--
-- Verificado en Neon dev (2026-05-06):
--   * Afiliacion.tipoSalario: 5/5 filas con valor 'BASICO' (default), 0 con
--     valor distinto. El bot ya quema TipoSalario="1" (Básico) en el
--     Portal AXA, así que el dato no se usa.
--   * Empresa.colpatriaModalidadTrabajoDefault: 4/4 empresas en NULL. El
--     bot ya quema ModalidadTrabajo="01" (Presencial).
--
-- Sin pérdida de información operativa.

ALTER TABLE "afiliaciones" DROP COLUMN "tipoSalario";

ALTER TABLE "empresas" DROP COLUMN "colpatriaModalidadTrabajoDefault";
