import { Router } from "express";
import { AuthRouter } from "./auth/router";
import { UserRouter } from "./auth/user.router";
import { RoleRouter } from "./auth/role.router";
import { AuthMiddleware } from "./auth/middleware";
import { categoryRoute } from "./category/router";
import { colorRoute } from "./color/router";
import { sizeRoute } from "./size/router";
import { productRoute } from "./product/router";
import { inventoryRoute } from "./inventory/router";
import { storeRoute } from "./store/router";

export class AppRouter{

    static get router():Router{
        const router = Router();
        router.use('/api/auth', AuthRouter.router);
        router.use('/api/users', UserRouter.router);
        router.use('/api/roles', RoleRouter.router);

        // Rutas protegidas - requieren autenticación
        router.use('/api/categorie', AuthMiddleware.validateJWT, categoryRoute.router);
        router.use('/api/color', AuthMiddleware.validateJWT, colorRoute.router);
        router.use('/api/size', AuthMiddleware.validateJWT, sizeRoute.router);
        router.use('/api/products', AuthMiddleware.validateJWT, productRoute.router);
        router.use('/api/inventory', AuthMiddleware.validateJWT, inventoryRoute.router);
        router.use('/api/stores', AuthMiddleware.validateJWT, storeRoute.router);

        return router;
    }
}