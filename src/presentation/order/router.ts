import { Router } from 'express';
import { OrderService } from '../services/order.service';
import { OrderController } from './controller';

export class orderRoute {
    static get router(): Router {
        const router = Router();
        const orderServiceInstance = new OrderService();
        const controller = new OrderController(orderServiceInstance);

        // Crear pedido
        router.post('/', controller.createOrder);

        // Listar pedidos
        router.get('/', controller.listOrders);

        // Obtener stock de variantes para tienda
        router.get('/variant-stock', controller.getVariantStock);

        // Obtener stock remoto para una variante
        router.get('/remote-stock/:variantId', controller.getRemoteStock);

        // Actualizar picking del pedido
        router.patch('/:id/picking', controller.updateOrderPicking);

        // Obtener pedido por ID
        router.get('/:id', controller.getOrderById);

        // Actualizar estado del pedido
        router.patch('/:id/status', controller.updateOrderStatus);

        // Asignar responsable
        router.patch('/:id/assign', controller.assignResponsible);

        // Reservar stock remoto
        router.post('/:id/reserve-remote', controller.reserveRemoteStock);

        return router;
    }
}
