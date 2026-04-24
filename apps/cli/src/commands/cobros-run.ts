/**
 * Comandos CLI para gestión de cobros a aliados.
 *
 * - cobros:generar [--periodo YYYY-MM]
 *     Genera (o regenera) el CobroAliado para todas las sucursales activas
 *     con tarifas configuradas, correspondiente al período indicado. Si no
 *     se pasa --periodo, usa el período del mes ANTERIOR (típico cierre al
 *     día 1 del mes siguiente a las 00:00).
 *
 * - cobros:bloquear-morosos
 *     Marca CobroAliado PENDIENTE con fechaLimite vencida como VENCIDO y
 *     bloquea la sucursal con bloqueadaPorMora=true. Diseñado para cron
 *     diario a partir del día 16.
 *
 * Ambos son exit 0 si OK, exit 1 si hay errores.
 */

import { Prisma, prisma } from '@pila/db';
import { unlink } from 'node:fs/promises';

const DIAS_MINIMOS_MENSUALIDAD = 6;

type Regimen = 'ORDINARIO' | 'RESOLUCION';

function excluirPorRetiroCorto(fechaIngreso: Date, fechaRetiro: Date | null): boolean {
  if (!fechaRetiro) return false;
  const msDia = 1000 * 60 * 60 * 24;
  const diff = fechaRetiro.getTime() - fechaIngreso.getTime();
  const dias = Math.floor(diff / msDia);
  return dias < DIAS_MINIMOS_MENSUALIDAD;
}

function calcularFechaLimite(periodoAnio: number, periodoMes: number): Date {
  const anio = periodoMes === 12 ? periodoAnio + 1 : periodoAnio;
  const mes = periodoMes === 12 ? 1 : periodoMes + 1;
  return new Date(Date.UTC(anio, mes - 1, 15, 23, 59, 59));
}

async function nextCobroConsecutivo(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('cobro_aliado_consecutivo_seq') AS nextval
  `;
  const n = Number(rows[0]!.nextval);
  return `CA-${String(n).padStart(6, '0')}`;
}

/**
 * Genera cobro de una sucursal individual. Lógica duplicada deliberadamente
 * del módulo web (lib/finanzas/cobro-generar.ts) para mantener el CLI
 * autosuficiente — no importa código de apps/web.
 */
async function generarCobroAliadoInterno(params: {
  sucursalId: string;
  periodoId: string;
}): Promise<
  { ok: true; consecutivo: string; total: number; creado: boolean } | { ok: false; error: string }
> {
  const { sucursalId, periodoId } = params;

  const [sucursal, periodo] = await Promise.all([
    prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        codigo: true,
        tarifaOrdinario: true,
        tarifaResolucion: true,
      },
    }),
    prisma.periodoContable.findUnique({
      where: { id: periodoId },
      select: { id: true, anio: true, mes: true },
    }),
  ]);
  if (!sucursal) return { ok: false, error: 'Sucursal no existe' };
  if (!periodo) return { ok: false, error: 'Período no existe' };

  const tarifaOrd = sucursal.tarifaOrdinario ? Number(sucursal.tarifaOrdinario) : 0;
  const tarifaRes = sucursal.tarifaResolucion ? Number(sucursal.tarifaResolucion) : 0;
  if (tarifaOrd === 0 && tarifaRes === 0) {
    return { ok: false, error: 'Sin tarifas configuradas' };
  }

  const existente = await prisma.cobroAliado.findUnique({
    where: { sucursalId_periodoId: { sucursalId, periodoId } },
    select: { id: true, consecutivo: true },
  });

  const inicio = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const fin = new Date(Date.UTC(periodo.anio, periodo.mes, 0, 23, 59, 59));

  const [solicitudes, comprobantes] = await Promise.all([
    prisma.soporteAfiliacion.findMany({
      where: {
        sucursalId,
        estado: 'PROCESADA',
        fechaRadicacion: { gte: inicio, lte: fin },
      },
      select: {
        afiliacionId: true,
        afiliacion: {
          select: {
            regimen: true,
            cotizante: {
              select: { primerNombre: true, primerApellido: true, numeroDocumento: true },
            },
          },
        },
      },
    }),
    prisma.comprobante.findMany({
      where: {
        procesadoEn: { not: null, gte: inicio, lte: fin },
        estado: { not: 'ANULADO' },
        tipo: 'MENSUALIDAD',
        OR: [
          { cotizante: { sucursalId } },
          { cuentaCobro: { sucursalId } },
          { asesorComercial: { OR: [{ sucursalId: null }, { sucursalId }] } },
        ],
      },
      select: {
        id: true,
        cotizante: {
          select: {
            primerNombre: true,
            primerApellido: true,
            numeroDocumento: true,
            afiliaciones: {
              select: { regimen: true, fechaIngreso: true, fechaRetiro: true },
            },
          },
        },
      },
    }),
  ]);

  type Concepto = {
    tipo: 'AFILIACION_PROCESADA' | 'MENSUALIDAD';
    descripcion: string;
    referenciaId: string | null;
    regimen: Regimen;
    cantidad: number;
    valorUnit: number;
    subtotal: number;
  };
  const conceptos: Concepto[] = [];

  for (const sol of solicitudes) {
    const reg = (sol.afiliacion?.regimen ?? 'ORDINARIO') as Regimen;
    const tarifa = reg === 'RESOLUCION' ? tarifaRes : tarifaOrd;
    if (tarifa === 0) continue;
    const cot = sol.afiliacion?.cotizante;
    const nombre = cot ? `${cot.primerNombre} ${cot.primerApellido}`.trim() : '—';
    const doc = cot?.numeroDocumento ?? '—';
    conceptos.push({
      tipo: 'AFILIACION_PROCESADA',
      descripcion: `Afiliación ${doc} · ${nombre} (${reg})`,
      referenciaId: sol.afiliacionId,
      regimen: reg,
      cantidad: 1,
      valorUnit: tarifa,
      subtotal: tarifa,
    });
  }

  for (const c of comprobantes) {
    const afs = c.cotizante?.afiliaciones ?? [];
    const todasExcluidas =
      afs.length > 0 && afs.every((a) => excluirPorRetiroCorto(a.fechaIngreso, a.fechaRetiro));
    if (todasExcluidas) continue;
    const activa = afs.find((a) => a.fechaRetiro === null) ?? afs[0];
    const reg = (activa?.regimen ?? 'ORDINARIO') as Regimen;
    const tarifa = reg === 'RESOLUCION' ? tarifaRes : tarifaOrd;
    if (tarifa === 0) continue;
    const nombre = c.cotizante
      ? `${c.cotizante.primerNombre} ${c.cotizante.primerApellido}`.trim()
      : '—';
    const doc = c.cotizante?.numeroDocumento ?? '—';
    conceptos.push({
      tipo: 'MENSUALIDAD',
      descripcion: `Mensualidad ${doc} · ${nombre} (${reg})`,
      referenciaId: c.id,
      regimen: reg,
      cantidad: 1,
      valorUnit: tarifa,
      subtotal: tarifa,
    });
  }

  if (conceptos.length === 0) return { ok: false, error: 'Sin conceptos cobrables' };

  const cantAf = conceptos.filter((c) => c.tipo === 'AFILIACION_PROCESADA').length;
  const cantMen = conceptos.filter((c) => c.tipo === 'MENSUALIDAD').length;
  const valAf = conceptos
    .filter((c) => c.tipo === 'AFILIACION_PROCESADA')
    .reduce((s, c) => s + c.subtotal, 0);
  const valMen = conceptos
    .filter((c) => c.tipo === 'MENSUALIDAD')
    .reduce((s, c) => s + c.subtotal, 0);
  const total = valAf + valMen;
  const fechaLimite = calcularFechaLimite(periodo.anio, periodo.mes);

  const targetId = await prisma.$transaction(async (tx) => {
    let id: string;
    if (existente) {
      await tx.cobroAliadoConcepto.deleteMany({ where: { cobroId: existente.id } });
      await tx.cobroAliado.update({
        where: { id: existente.id },
        data: {
          cantAfiliaciones: cantAf,
          cantMensualidades: cantMen,
          valorAfiliaciones: new Prisma.Decimal(valAf),
          valorMensualidades: new Prisma.Decimal(valMen),
          totalCobro: new Prisma.Decimal(total),
          fechaLimite,
        },
      });
      id = existente.id;
    } else {
      const consec = await nextCobroConsecutivo();
      const created = await tx.cobroAliado.create({
        data: {
          consecutivo: consec,
          sucursalId,
          periodoId,
          fechaLimite,
          cantAfiliaciones: cantAf,
          cantMensualidades: cantMen,
          valorAfiliaciones: new Prisma.Decimal(valAf),
          valorMensualidades: new Prisma.Decimal(valMen),
          totalCobro: new Prisma.Decimal(total),
          estado: 'PENDIENTE',
        },
        select: { id: true },
      });
      id = created.id;
    }
    await tx.cobroAliadoConcepto.createMany({
      data: conceptos.map((c) => ({
        cobroId: id,
        tipo: c.tipo,
        descripcion: c.descripcion,
        referenciaId: c.referenciaId,
        regimen: c.regimen,
        cantidad: c.cantidad,
        valorUnit: new Prisma.Decimal(c.valorUnit),
        subtotal: new Prisma.Decimal(c.subtotal),
      })),
    });
    return id;
  });

  const final = await prisma.cobroAliado.findUniqueOrThrow({
    where: { id: targetId },
    select: { consecutivo: true },
  });
  return { ok: true, consecutivo: final.consecutivo, total, creado: !existente };
}

// --- Comandos exportados --------------------------------------------------

export async function cobrosGenerarCommand(options: { periodo?: string }): Promise<void> {
  // Resolver período (por default, mes anterior al actual)
  let anio: number;
  let mes: number;
  if (options.periodo) {
    const m = /^(\d{4})-(\d{2})$/.exec(options.periodo);
    if (!m) {
      console.error('❌ Formato inválido. Usa --periodo YYYY-MM');
      process.exit(1);
    }
    anio = Number(m[1]);
    mes = Number(m[2]);
  } else {
    const now = new Date();
    // mes anterior al mes actual
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    anio = ref.getFullYear();
    mes = ref.getMonth() + 1;
  }

  console.log(`\n💰 Generando cobros del período ${anio}-${String(mes).padStart(2, '0')}\n`);

  const periodo = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
    select: { id: true },
  });
  if (!periodo) {
    console.error(`❌ No existe PeriodoContable para ${anio}-${mes}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const sucursales = await prisma.sucursal.findMany({
    where: {
      active: true,
      OR: [{ tarifaOrdinario: { not: null } }, { tarifaResolucion: { not: null } }],
    },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { codigo: 'asc' },
  });

  let creados = 0;
  let saltados = 0;
  const errores: Array<{ codigo: string; mensaje: string }> = [];

  for (const s of sucursales) {
    const res = await generarCobroAliadoInterno({ sucursalId: s.id, periodoId: periodo.id });
    if (!res.ok) {
      if (res.error.includes('Sin conceptos')) {
        console.log(`  ⊝ ${s.codigo} — ${res.error}`);
        saltados++;
      } else {
        console.log(`  ❌ ${s.codigo} — ${res.error}`);
        errores.push({ codigo: s.codigo, mensaje: res.error });
      }
    } else if (res.creado) {
      console.log(
        `  ✓ ${s.codigo} → ${res.consecutivo} (total ${res.total.toLocaleString('es-CO')})`,
      );
      creados++;
    } else {
      console.log(
        `  ⊚ ${s.codigo} → ${res.consecutivo} actualizado (total ${res.total.toLocaleString('es-CO')})`,
      );
      creados++;
    }
  }

  console.log(
    `\n📊 ${sucursales.length} sucursales · ${creados} generados · ${saltados} saltados · ${errores.length} errores`,
  );
  await prisma.$disconnect();
  if (errores.length > 0) process.exit(1);
}

export async function cobrosBloquearMorososCommand(): Promise<void> {
  const ahora = new Date();
  console.log(`\n🔒 Bloqueo de aliados morosos — ${ahora.toISOString()}\n`);

  const vencidos = await prisma.cobroAliado.findMany({
    where: {
      estado: 'PENDIENTE',
      fechaLimite: { lt: ahora },
    },
    select: {
      id: true,
      consecutivo: true,
      sucursalId: true,
      sucursal: { select: { codigo: true } },
      totalCobro: true,
    },
  });

  if (vencidos.length === 0) {
    console.log('  ℹ Sin cobros vencidos.');
    await prisma.$disconnect();
    return;
  }

  const sucursalIds = Array.from(new Set(vencidos.map((v) => v.sucursalId)));

  await prisma.$transaction([
    prisma.cobroAliado.updateMany({
      where: { id: { in: vencidos.map((v) => v.id) } },
      data: { estado: 'VENCIDO', fechaBloqueo: ahora },
    }),
    prisma.sucursal.updateMany({
      where: { id: { in: sucursalIds } },
      data: { bloqueadaPorMora: true },
    }),
  ]);

  for (const v of vencidos) {
    console.log(
      `  ⚠ ${v.sucursal.codigo} — ${v.consecutivo} (${Number(v.totalCobro).toLocaleString('es-CO')}) VENCIDO`,
    );
  }
  console.log(
    `\n🔒 ${vencidos.length} cobros → VENCIDO · ${sucursalIds.length} sucursales bloqueadas`,
  );
  await prisma.$disconnect();
}

// Placeholder export to avoid unused `unlink` warning — reserved for future
// retention expansions within finanzas context.
void unlink;
