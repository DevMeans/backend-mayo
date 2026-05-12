import { prisma } from '../../data/prisma';
import { CreateRoleDto, UpdateRoleDto } from '../../domain/dtos/role.dto';

export class RoleService {
    static async create(createRoleDto: CreateRoleDto) {
        const { name } = createRoleDto;

        // Check if role name already exists
        const existingRole = await prisma.role.findUnique({
            where: { name }
        });

        if (existingRole) {
            throw new Error('El nombre del rol ya existe');
        }

        return await prisma.role.create({
            data: { name }
        });
    }

    static async findAll() {
        return await prisma.role.findMany({
            include: {
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        isActive: true
                    }
                }
            }
        });
    }

    static async findById(id: number) {
        const role = await prisma.role.findUnique({
            where: { id },
            include: {
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        isActive: true
                    }
                }
            }
        });

        if (!role) {
            throw new Error('Rol no encontrado');
        }

        return role;
    }

    static async update(id: number, updateRoleDto: UpdateRoleDto) {
        const updateData: any = {};

        if (updateRoleDto.name !== undefined) {
            // Check if new name already exists
            const existingRole = await prisma.role.findUnique({
                where: { name: updateRoleDto.name }
            });

            if (existingRole && existingRole.id !== id) {
                throw new Error('El nombre del rol ya existe');
            }

            updateData.name = updateRoleDto.name;
        }

        return await prisma.role.update({
            where: { id },
            data: updateData,
            include: {
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        isActive: true
                    }
                }
            }
        });
    }

    static async delete(id: number) {
        // Check if role has users
        const roleWithUsers = await prisma.role.findUnique({
            where: { id },
            include: { users: true }
        });

        if (!roleWithUsers) {
            throw new Error('Rol no encontrado');
        }

        if (roleWithUsers.users.length > 0) {
            throw new Error('No se puede eliminar un rol que tiene usuarios asignados');
        }

        await prisma.role.delete({
            where: { id }
        });

        return { message: 'Rol eliminado exitosamente' };
    }
}