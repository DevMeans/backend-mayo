import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { PermissionService } from '../presentation/services/permission.service';

async function main() {
    const roleDefinitions: Array<{ name: string; description: string }> = [
        { name: 'ADMIN', description: 'Acceso total al sistema' },
        { name: 'MANAGER', description: 'Gestion operativa del negocio' },
        { name: 'SELLER', description: 'Operacion de ventas y POS' },
        { name: 'WAREHOUSE', description: 'Operacion de inventario y transferencias' },
        { name: 'PICKER', description: 'Operacion de picking y preparacion de pedidos' },
        { name: 'USER', description: 'Acceso basico de consulta' }
    ];

    const roleByName = new Map<string, { id: number; name: string }>();

    for (const definition of roleDefinitions) {
        const role = await prisma.role.upsert({
            where: { name: definition.name },
            update: {
                description: definition.description,
                isActive: true
            },
            create: {
                name: definition.name,
                description: definition.description,
                isActive: true
            }
        });

        roleByName.set(role.name, { id: role.id, name: role.name });
    }

    await PermissionService.seedDefaultPermissionsForRoles(
        new Map(Array.from(roleByName.values()).map((role) => [role.id, role.name]))
    );

    const adminRole = roleByName.get('ADMIN');
    const userRole = roleByName.get('USER');

    if (!adminRole || !userRole) {
        throw new Error('No se pudieron cargar roles base para el seed');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create admin user
    await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {
            firstName: 'Admin',
            lastName: 'User',
            password: hashedPassword,
            roleId: adminRole.id,
            isActive: true
        },
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
        update: {
            firstName: 'Regular',
            lastName: 'User',
            password: hashedPassword,
            roleId: userRole.id,
            isActive: true
        },
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
