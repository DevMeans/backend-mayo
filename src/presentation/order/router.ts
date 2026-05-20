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

        // Reservas de una orden
        router.get('/:id/reservations', controller.getOrderReservations);

        // Obtener picking de una orden
        router.get('/:id/picking', controller.getOrderPicking);

        // Iniciar picking
        router.post('/:id/picking/start', controller.startOrderPicking);

        // Finalizar picking
        router.patch('/:id/picking/complete', controller.completeOrderPicking);

        // Actualizar picking del pedido
        router.patch('/:id/picking', controller.updateOrderPicking);

        // Actualizar item de picking
        router.patch('/picking/items/:itemId', controller.updatePickingItem);

        // Obtener pedido por ID
        router.get('/:id', controller.getOrderById);

        // Actualizar estado del pedido
        router.patch('/:id/status', controller.updateOrderStatus);

        // Asignar responsable
        router.patch('/:id/assign', controller.assignResponsible);

        // Delegar responsabilidad de devolucion
        router.patch('/:id/return-responsibility/delegate', controller.delegateReturnResponsibility);

        // Aceptar responsabilidad de devolucion
        router.patch('/:id/return-responsibility/accept', controller.acceptReturnResponsibility);

        // Reservar stock remoto
        router.post('/:id/reserve-remote', controller.reserveRemoteStock);

        return router;
    }
}
