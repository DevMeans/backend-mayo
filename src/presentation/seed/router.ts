import { Router } from 'express';
import { SeedController } from './controller';

export class SeedRoute {
    static get router(): Router {
        const router = Router();
        router.post('/', SeedController.run);
        return router;
    }
}
