import { Request, Response } from 'express';
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleDto } from '../../domain/dtos/role.dto';
import { AuthRequest } from '../auth/middleware';

export class RoleController {
    static async create(req: AuthRequest, res: Response) {
        try {
            const [error, createRoleDto] = CreateRoleDto.create(req.body);
            if (error) {
                return res.status(400).json({ message: error });
            }

            const role = await RoleService.create(createRoleDto!);
            res.status(201).json(role);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    static async findAll(req: AuthRequest, res: Response) {
        try {
            const roles = await RoleService.findAll();
            res.json(roles);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    static async findById(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const role = await RoleService.findById(Number(id));
            res.json(role);
        } catch (error: any) {
            res.status(404).json({ message: error.message });
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const [error, updateRoleDto] = UpdateRoleDto.create(req.body);
            if (error) {
                return res.status(400).json({ message: error });
            }

            const role = await RoleService.update(Number(id), updateRoleDto!);
            res.json(role);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    static async delete(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const result = await RoleService.delete(Number(id));
            res.json(result);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }
}