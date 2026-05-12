import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { envs } from '../../config/envs';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
    };
}

export class AuthMiddleware {
    static validateJWT(req: AuthRequest, res: Response, next: NextFunction) {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Token no proporcionado' });
        }

        try {
            const decoded = jwt.verify(token, envs.JWT_SECRET) as any;
            req.user = {
                id: decoded.id,
                email: decoded.email,
                role: decoded.role
            };
            next();
        } catch (error: any) {
            if (error instanceof jwt.TokenExpiredError) {
                return res.status(401).json({ message: 'Token expirado' });
            }
            return res.status(401).json({ message: 'Token inválido' });
        }
    }

    static requireRole(requiredRole: string) {
        return (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.user) {
                return res.status(401).json({ message: 'Usuario no autenticado' });
            }

            if (req.user.role !== requiredRole) {
                return res.status(403).json({ message: 'Acceso denegado: rol insuficiente' });
            }

            next();
        };
    }

    static requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
        return AuthMiddleware.requireRole('ADMIN')(req, res, next);
    }
}