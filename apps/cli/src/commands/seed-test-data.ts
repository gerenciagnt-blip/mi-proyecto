/**
 * Seed de datos de prueba — idempotente (safe para correr múltiples veces).
 *
 * Crea un set mínimo útil para dev/pruebas:
 *   - 1 sucursal de test ("TEST-01")
 *   - 1 usuario ALIADO_OWNER asignado a esa sucursal
 *   - 1 empresa de test
 *
 * Uso:
 *   pnpm cli seed:test-data
 *   pnpm cli seed:test-data --force    # actualiza password + datos aunque existan
 *
 * Credenciales:
 *   email:    aliado-test@pila.local
 *   password: Aliado123!
 *
 * NO crea datos en producción si detecta que ya hay >50 usuarios en BD
 * (presuncion de "esto ya es prod real").
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@pila/db';

const EMAIL = 'aliado-test@pila.local';
const PASSWORD = 'Aliado123!';
const NAME = 'Aliado Test';
const SUC_CODIGO = 'TEST-01';
const SUC_NOMBRE = 'Sucursal de pruebas';

export async function seedTestDataCommand(options: { force?: boolean }): Promise<void> {
  console.log('\n🌱 Seed datos de prueba\n');

  // Guardarraíl anti-prod: si ya hay más de 50 usuarios, probablemente es
  // una BD real. Abortar para no contaminar.
  const userCount = await prisma.user.count();
  if (userCount > 50 && !options.force) {
    console.error(
      `❌ Detectados ${userCount} usuarios en BD — parece producción. Use --force si está seguro.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // 1. Sucursal
  const sucursal = await prisma.sucursal.upsert({
    where: { codigo: SUC_CODIGO },
    create: { codigo: SUC_CODIGO, nombre: SUC_NOMBRE, active: true },
    update: { nombre: SUC_NOMBRE, active: true },
  });
  console.log(`  ✓ Sucursal ${SUC_CODIGO} (${sucursal.id.slice(0, 8)}…)`);

  // 2. Usuario ALIADO_OWNER (o actualiza password si --force)
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  if (existing) {
    if (options.force) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: NAME,
          role: 'ALIADO_OWNER',
          sucursalId: sucursal.id,
          active: true,
        },
      });
      console.log(`  ✓ Usuario ${EMAIL} actualizado`);
    } else {
      console.log(`  ℹ Usuario ${EMAIL} ya existe (use --force para actualizar)`);
    }
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        passwordHash,
        role: 'ALIADO_OWNER',
        sucursalId: sucursal.id,
        active: true,
      },
    });
    console.log(`  ✓ Usuario ${EMAIL} creado (role=ALIADO_OWNER)`);
  }

  // 3. Empresa de test
  const empresa = await prisma.empresa.upsert({
    where: { nit: '900999999' },
    create: {
      nit: '900999999',
      nombre: 'Empresa Test S.A.S.',
      ciiuPrincipal: '6201',
      active: true,
    },
    update: { nombre: 'Empresa Test S.A.S.', active: true },
  });
  console.log(`  ✓ Empresa Test S.A.S. (NIT 900999999, ${empresa.id.slice(0, 8)}…)`);

  console.log('\n✅ Seed completo. Credenciales:');
  console.log(`   email:    ${EMAIL}`);
  console.log(`   password: ${PASSWORD}`);
  console.log(`   sucursal: ${SUC_CODIGO}`);

  await prisma.$disconnect();
}
