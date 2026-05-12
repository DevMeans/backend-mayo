import { prisma } from '../../data/prisma';
import bcrypt from 'bcryptjs';
import { CreateUserDto, UpdateUserDto } from '../../domain/dtos/user.dto';

export class UserService {
    static async create(createUserDto: CreateUserDto) {
        const { firstName, lastName, email, password, roleId, isActive } = createUserDto;

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            throw new Error('El correo electrónico ya está registrado');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                password: hashedPassword,
                roleId,
                isActive
            },
            include: {
                role: true
            }
        });

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    static async findAll() {
        const users = await prisma.user.findMany({
            include: {
                role: true
            }
        });

        // Remove passwords from response
        return users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
    }

    static async findById(id: number) {
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                role: true
            }
        });

        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    static async update(id: number, updateUserDto: UpdateUserDto) {
        const updateData: any = {};

        if (updateUserDto.firstName !== undefined) updateData.firstName = updateUserDto.firstName;
        if (updateUserDto.lastName !== undefined) updateData.lastName = updateUserDto.lastName;
        if (updateUserDto.email !== undefined) updateData.email = updateUserDto.email;
        if (updateUserDto.roleId !== undefined) updateData.roleId = updateUserDto.roleId;
        if (updateUserDto.isActive !== undefined) updateData.isActive = updateUserDto.isActive;

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: {
                role: true
            }
        });

        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    static async delete(id: number) {
        await prisma.user.delete({
            where: { id }
        });
        return { message: 'Usuario eliminado exitosamente' };
    }

    static async changePassword(id: number, newPassword: string) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });

        return { message: 'Contraseña actualizada exitosamente' };
    }
}