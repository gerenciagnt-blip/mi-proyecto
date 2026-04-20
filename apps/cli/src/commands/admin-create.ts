import { input, password } from '@inquirer/prompts';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@pila/db';

const EmailSchema = z.string().email({ message: 'Correo no válido' });
const PassSchema = z.string().min(8, { message: 'Mínimo 8 caracteres' });

export async function adminCreateCommand() {
  console.log('\n👤 Crear usuario ADMIN\n');

  const email = await input({
    message: 'Email:',
    validate: (v) => EmailSchema.safeParse(v).success || 'Correo no válido',
  });

  const exists = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (exists) {
    console.log(`\n❌ Ya existe un usuario con ese email (${exists.email}, rol ${exists.role})`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const name = await input({
    message: 'Nombre completo:',
    validate: (v) => v.trim().length > 0 || 'Obligatorio',
  });

  const pass = await password({
    message: 'Contraseña (mín. 8):',
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

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`\n✅ Admin creado: ${user.email} (id: ${user.id})`);
  console.log('   Ya puedes iniciar sesión en http://localhost:3000/login\n');

  await prisma.$disconnect();
}
