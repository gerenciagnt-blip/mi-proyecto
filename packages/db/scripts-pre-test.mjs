import { PrismaClient } from '@prisma/client';

const documento = process.argv[2];
const empresaId = process.argv[3];
const p = new PrismaClient();

const af = await p.afiliacion.findFirst({
  where: {
    empresaId,
    estado: 'ACTIVA',
    cotizante: { numeroDocumento: documento },
  },
  orderBy: { updatedAt: 'desc' },
  select: {
    id: true,
    estado: true,
    modalidad: true,
    nivelRiesgo: true,
    salario: true,
    cargo: true,
    fechaIngreso: true,
    arl: { select: { nombre: true } },
    cotizante: {
      select: {
        tipoDocumento: true,
        numeroDocumento: true,
        primerNombre: true,
        primerApellido: true,
        fechaNacimiento: true,
        genero: true,
        estadoCivil: true,
        email: true,
        celular: true,
        direccion: true,
        municipio: { select: { nombre: true } },
        departamento: { select: { nombre: true } },
      },
    },
  },
});

if (!af) {
  console.log(`❌ No hay afiliación ACTIVA del cotizante ${documento} en empresa ${empresaId}`);
  process.exit(1);
}

const c = af.cotizante;
const issues = [];
if (af.modalidad !== 'DEPENDIENTE') issues.push(`modalidad=${af.modalidad} (debe DEPENDIENTE)`);
if (!af.cargo) issues.push('cargo vacío');
if (!af.arl || !/colpatria/i.test(af.arl.nombre)) issues.push(`ARL=${af.arl?.nombre ?? '∅'} (debe contener Colpatria)`);
if (!c.email) issues.push('email vacío');
if (!c.celular) issues.push('celular vacío');
if (!c.direccion) issues.push('dirección vacía');
if (!c.fechaNacimiento) issues.push('fechaNacimiento vacía');
if (!c.genero) issues.push('género vacío');
if (!['CC', 'CE', 'TI', 'NIT', 'PAS'].includes(c.tipoDocumento))
  issues.push(`tipoDoc=${c.tipoDocumento} (no procesable por bot)`);

console.log(`\n🔍 Afiliación encontrada: ${af.id}\n`);
console.log(`   Cotizante: ${c.tipoDocumento} ${c.numeroDocumento} — ${c.primerNombre} ${c.primerApellido}`);
console.log(`   Estado: ${af.estado} ${af.modalidad} N${af.nivelRiesgo}`);
console.log(`   Cargo: ${af.cargo ?? '∅'}`);
console.log(`   ARL: ${af.arl?.nombre ?? '∅'}`);
console.log(`   Fecha nacimiento: ${c.fechaNacimiento?.toISOString().slice(0,10) ?? '∅'}`);
console.log(`   Género: ${c.genero ?? '∅'} · Estado civil: ${c.estadoCivil ?? '∅'}`);
console.log(`   Email: ${c.email ?? '∅'}`);
console.log(`   Celular: ${c.celular ?? '∅'}`);
console.log(`   Dirección: ${c.direccion ?? '∅'}`);
console.log(`   Municipio/Depto: ${c.municipio?.nombre ?? '∅'} / ${c.departamento?.nombre ?? '∅'}`);

if (issues.length === 0) {
  console.log('\n✅ Lista para test-ingreso');
} else {
  console.log('\n❌ Issues que bloquean el bot:');
  for (const i of issues) console.log('   · ' + i);
}

// Buscar job creado por trigger
const jobs = await p.colpatriaAfiliacionJob.findMany({
  where: { afiliacionId: af.id },
  orderBy: { createdAt: 'desc' },
  take: 3,
  select: { id: true, status: true, createdAt: true, error: true },
});
console.log(`\n🤖 Jobs Colpatria asociados: ${jobs.length}`);
for (const j of jobs) {
  console.log(`   · ${j.status} ${j.createdAt.toISOString().slice(11,19)} ${j.error ? `· ${j.error.slice(0,80)}` : ''}`);
  console.log(`     UUID: ${j.id}`);
}

await p.$disconnect();
