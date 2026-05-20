import { Router } from "express";
import { AuthRouter } from "./auth/router";
import { UserRouter } from "./auth/user.router";
import { RoleRouter } from "./auth/role.router";
import { AuthMiddleware } from "./auth/middleware";
import { RoleController } from "./auth/role.controller";
import { categoryRoute } from "./category/router";
import { colorRoute } from "./color/router";
import { sizeRoute } from "./size/router";
import { productRoute } from "./product/router";
import { inventoryRoute } from "./inventory/router";
import { storeRoute } from "./store/router";
import { orderRoute } from "./order/router";
import { publicRoute } from "./public/router";
import { paymentMethodRoute } from "./payment-method/router";
import { systemConfigRoute } from "./system-config/router";

export class AppRouter{

    static get router():Router{
        const router = Router();
        router.use('/api/auth', AuthRouter.router);
        router.use('/api/users', UserRouter.router);
        router.use('/api/roles', RoleRouter.router);
        router.use('/api/public', publicRoute.router);
        router.get('/api/permissions', AuthMiddleware.validateJWT, AuthMiddleware.requirePermission('roles.permissions'), RoleController.listPermissions);

        // Rutas protegidas - requieren autenticación
        router.use('/api/categorie', AuthMiddleware.validateJWT, categoryRoute.router);
        router.use('/api/color', AuthMiddleware.validateJWT, colorRoute.router);
        router.use('/api/size', AuthMiddleware.validateJWT, sizeRoute.router);
        router.use('/api/products', AuthMiddleware.validateJWT, productRoute.router);
        router.use('/api/inventory', AuthMiddleware.validateJWT, inventoryRoute.router);
        router.use('/api/stores', AuthMiddleware.validateJWT, storeRoute.router);
        router.use('/api/orders', AuthMiddleware.validateJWT, orderRoute.router);
        router.use('/api/payment-methods', AuthMiddleware.validateJWT, paymentMethodRoute.router);
        router.use('/api/system-config', AuthMiddleware.validateJWT, systemConfigRoute.router);

        return router;
    }
}
