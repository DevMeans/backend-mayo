import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../../domain/dtos/login.dto';

export class AuthController {
    static async login(req: Request, res: Response) {
        try {
            const [error, loginDto] = LoginDto.create(req.body);
            if (error) {
                return res.status(400).json({ message: error });
            }

            const result = await AuthService.login(loginDto!);
            res.json(result);
        } catch (error: any) {
            res.status(401).json({ message: error.message });
        }
    }

    static async logout(req: Request, res: Response) {
        // For JWT, logout is handled client-side by removing the token
        res.json({ message: 'Sesión cerrada exitosamente' });
    }
}