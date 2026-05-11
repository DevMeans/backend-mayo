import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

async function main() {
    // Create roles
    const adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' }
    });

    const userRole = await prisma.role.upsert({
        where: { name: 'USER' },
        update: {},
        create: { name: 'USER' }
    });

    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create admin user
    await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com',
            password: hashedPassword,
            roleId: adminRole.id
        }
    });

    // Create regular user
    await prisma.user.upsert({
        where: { email: 'user@example.com' },
        update: {},
        create: {
            firstName: 'Regular',
            lastName: 'User',
            email: 'user@example.com',
            password: hashedPassword,
            roleId: userRole.id
        }
    });

    console.log('Seed completed');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });