import { Router } from "express";
import { UserController } from "./user.controller";
import { AuthMiddleware } from "./middleware";

export class UserRouter {
    static get router(): Router {
        const router = Router();

        router.post('/', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.create);
        router.get('/', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.findAll);
        router.get('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.findById);
        router.put('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.update);
        router.delete('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.delete);
        router.post('/:id/change-password', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, UserController.changePassword);

        return router;
    }
}