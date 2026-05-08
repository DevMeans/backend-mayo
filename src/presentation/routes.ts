import { Router } from "express";
import { AuthRouter } from "./auth/router";
import { categoryRoute } from "./category/router";
import { colorRoute } from "./color/router";

export class AppRouter{

    static get router():Router{
        const router = Router();
        router.use('/api/auth', AuthRouter.router);
        router.use('/api/categorie', categoryRoute.router);
        router.use('/api/color', colorRoute.router);
       
        return router;
    }
}