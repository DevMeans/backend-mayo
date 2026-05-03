import { Router } from "express";
import { AuthRouter } from "./auth/router";

export class AppRouter{

    static get router():Router{
        const router = Router();
        router.use('/api/auth', AuthRouter.router);
        return router;
    }
}