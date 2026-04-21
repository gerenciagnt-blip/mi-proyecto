-- CreateTable
CREATE TABLE "tarifas_sgss" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "modalidad" "Modalidad",
    "nivelRiesgo" "NivelRiesgo",
    "exonera" BOOLEAN,
    "porcentaje" DECIMAL(6,4) NOT NULL,
    "etiqueta" TEXT,
    "observaciones" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_sgss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fsp_rangos" (
    "id" TEXT NOT NULL,
    "smlvDesde" DECIMAL(6,2) NOT NULL,
    "smlvHasta" DECIMAL(6,2),
    "porcentaje" DECIMAL(6,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fsp_rangos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarifas_sgss_concepto_idx" ON "tarifas_sgss"("concepto");

-- CreateIndex
CREATE INDEX "tarifas_sgss_active_idx" ON "tarifas_sgss"("active");

-- CreateIndex
CREATE INDEX "fsp_rangos_active_idx" ON "fsp_rangos"("active");

-- ==========================================================================
-- SEED: tarifas SGSS vigentes Colombia (estado abril 2026).
-- Ver porcentajes de referencia:
--   Dec. 2090/2003 (ARL), Ley 100/1993, Ley 1607/2012 (exoneraciones),
--   Ley 344/1996 (SENA/ICBF). FSP: artículo 27 Ley 100 (modif. Ley 797).
-- ==========================================================================

-- EPS dependiente — 12.5% no exonerado / 4% exonerado
INSERT INTO "tarifas_sgss" ("id", "concepto", "modalidad", "exonera", "porcentaje", "etiqueta", "observaciones", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'EPS', 'DEPENDIENTE', false, 12.5000, 'EPS Dependiente no exonerado', 'Aporte total 12.5% — empleador 8.5% + trabajador 4%', NOW()),
  (gen_random_uuid()::text, 'EPS', 'DEPENDIENTE', true,  4.0000, 'EPS Dependiente exonerado (Ley 1607)', 'Aporte total 4% — sólo trabajador (empleador exonerado en IBC<10 SMLV)', NOW()),
  (gen_random_uuid()::text, 'EPS', 'INDEPENDIENTE', NULL, 12.5000, 'EPS Independiente', 'Aporte total a cargo del cotizante', NOW());

-- AFP (pensión) — 16% para todos. No se afecta por Ley 1607.
INSERT INTO "tarifas_sgss" ("id", "concepto", "modalidad", "porcentaje", "etiqueta", "observaciones", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'AFP', NULL, 16.0000, 'Pensión (aporte obligatorio)', 'Empleador 12% + trabajador 4% en dependiente; 100% independiente', NOW());

-- ARL — 5 niveles de riesgo. Aplica igual para dependiente e independiente.
INSERT INTO "tarifas_sgss" ("id", "concepto", "nivelRiesgo", "porcentaje", "etiqueta", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ARL', 'I',   0.5220, 'ARL Nivel I',   NOW()),
  (gen_random_uuid()::text, 'ARL', 'II',  1.0460, 'ARL Nivel II',  NOW()),
  (gen_random_uuid()::text, 'ARL', 'III', 2.4350, 'ARL Nivel III', NOW()),
  (gen_random_uuid()::text, 'ARL', 'IV',  4.3500, 'ARL Nivel IV',  NOW()),
  (gen_random_uuid()::text, 'ARL', 'V',   6.9600, 'ARL Nivel V',   NOW());

-- CCF — dependiente 4%; independiente opcional 0.6% o 2%.
INSERT INTO "tarifas_sgss" ("id", "concepto", "modalidad", "porcentaje", "etiqueta", "observaciones", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CCF', 'DEPENDIENTE',   4.0000, 'CCF Dependiente',          'Aporte parafiscal a Caja de Compensación', NOW()),
  (gen_random_uuid()::text, 'CCF', 'INDEPENDIENTE', 0.6000, 'CCF Independiente 0.6%',   'Afiliación voluntaria — modalidad reducida', NOW()),
  (gen_random_uuid()::text, 'CCF', 'INDEPENDIENTE', 2.0000, 'CCF Independiente 2%',     'Afiliación voluntaria — modalidad integral', NOW());

-- SENA — 2%. Sólo DEPENDIENTE no exonerado.
INSERT INTO "tarifas_sgss" ("id", "concepto", "modalidad", "exonera", "porcentaje", "etiqueta", "observaciones", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'SENA', 'DEPENDIENTE', false, 2.0000, 'SENA Dependiente', 'Parafiscal — exonerado en empresas con Ley 1607', NOW());

-- ICBF — 3%. Sólo DEPENDIENTE no exonerado.
INSERT INTO "tarifas_sgss" ("id", "concepto", "modalidad", "exonera", "porcentaje", "etiqueta", "observaciones", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ICBF', 'DEPENDIENTE', false, 3.0000, 'ICBF Dependiente', 'Parafiscal — exonerado en empresas con Ley 1607', NOW());

-- ==========================================================================
-- SEED: FSP (Fondo de Solidaridad Pensional)
-- Se adiciona al 16% de AFP cuando el IBC supera los 4 SMLV.
-- ==========================================================================
INSERT INTO "fsp_rangos" ("id", "smlvDesde", "smlvHasta", "porcentaje", "updatedAt")
VALUES
  (gen_random_uuid()::text,  4.00, 16.00, 1.0000, NOW()),
  (gen_random_uuid()::text, 16.00, 17.00, 1.2000, NOW()),
  (gen_random_uuid()::text, 17.00, 18.00, 1.4000, NOW()),
  (gen_random_uuid()::text, 18.00, 19.00, 1.6000, NOW()),
  (gen_random_uuid()::text, 19.00, 20.00, 1.8000, NOW()),
  (gen_random_uuid()::text, 20.00, NULL,  2.0000, NOW());
