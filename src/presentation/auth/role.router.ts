import { Router } from "express";
import { RoleController } from "./role.controller";
import { AuthMiddleware } from "./middleware";

export class RoleRouter {
    static get router(): Router {
        const router = Router();

        router.post('/', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, RoleController.create);
        router.get('/', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, RoleController.findAll);
        router.get('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, RoleController.findById);
        router.put('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, RoleController.update);
        router.delete('/:id', AuthMiddleware.validateJWT, AuthMiddleware.requireAdmin, RoleController.delete);

        return router;
    }
}