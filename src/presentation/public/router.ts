import { Router } from 'express';
import { ProductService } from '../services/product.service';
import { OrderService } from '../services/order.service';
import { PublicController } from './controller';

export class publicRoute {
    static get router(): Router {
        const router = Router();
        const productService = new ProductService();
        const orderService = new OrderService();
        const controller = new PublicController(productService, orderService);

        router.get('/products', controller.listProducts);
        router.get('/products/:id', controller.getProductById);
        router.get('/stores', controller.listStores);

        router.post('/orders', controller.createMarketplaceOrder);
        router.get('/orders/track', controller.trackMarketplaceOrder);
        router.get('/orders/:code', controller.getMarketplaceOrderByCode);

        return router;
    }
}
