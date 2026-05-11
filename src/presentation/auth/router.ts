import { Router } from "express";
import { AuthController } from "./controller";

export class AuthRouter {
    static get router(): Router {
        const router = Router();

        router.post('/login', AuthController.login);
        router.post('/logout', AuthController.logout);

        return router;
    }
}