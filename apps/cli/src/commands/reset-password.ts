import { input, password } from '@inquirer/prompts';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@pila/db';

const EmailSchema = z.string().email({ message: 'Correo no válido' });
const PassSchema = z.string().min(8, { message: 'Mínimo 8 caracteres' });

export async function resetPasswordCommand() {
  console.log('\n🔑 Restablecer contraseña de un usuario\n');

  const email = await input({
    message: 'Email del usuario:',
    validate: (v) => EmailSchema.safeParse(v).success || 'Correo no válido',
  });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user) {
    console.log(`\n❌ No existe un usuario con ese email`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\n  Usuario: ${user.name}`);
  console.log(`  Rol:     ${user.role}`);
  console.log(`  Activo:  ${user.active ? 'sí' : 'NO (inactivo)'}\n`);

  const pass = await password({
    message: 'Nueva contraseña (mín. 8):',
    mask: '*',
    validate: (v) => PassSchema.safeParse(v).success || 'Mínimo 8 caracteres',
  });

  const passConfirm = await password({
    message: 'Repetir contraseña:',
    mask: '*',
  });

  if (pass !== passConfirm) {
    console.log('\n❌ Las contraseñas no coinciden');
    await prisma.$disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(pass, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, active: true }, // también reactiva si estaba inactivo
  });

  console.log(`\n✅ Contraseña actualizada para ${user.email}`);
  console.log('   Ya puedes iniciar sesión en http://localhost:3000/login\n');

  await prisma.$disconnect();
}
