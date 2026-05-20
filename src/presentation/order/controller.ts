import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { CreateOrderDto } from '../../domain/dtos/create-order.dto';
import { UpdateOrderStatusDto } from '../../domain/dtos/update-order-status.dto';
import { ListOrderDto } from '../../domain/dtos/list-order.dto';
import { AssignOrderResponsibleDto } from '../../domain/dtos/assign-order-responsible.dto';
import { UpdateOrderPickingDto } from '../../domain/dtos/update-order-picking.dto';
import { DelegateOrderReturnDto } from '../../domain/dtos/delegate-order-return.dto';
import { CustomError } from '../../domain/errors/custom.error';
import { AuthRequest } from '../auth/middleware';

export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    /**
     * Crear pedido
     * POST /api/orders
     */
    createOrder = async (req: Request, res: Response) => {
        const [error, dto] = CreateOrderDto.create(req.body);

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const order = await this.orderService.createOrder(dto!);
            res.status(201).json({
                success: true,
                data: order,
                message: 'Pedido creado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Listar pedidos
     * GET /api/orders
     */
    listOrders = async (req: Request, res: Response) => {
        const [error, dto] = ListOrderDto.create(req.query);

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const result = await this.orderService.listOrders(dto!);
            res.status(200).json({
                success: true,
                data: result.data,
                pagination: result.pagination,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Obtener pedido por ID
     * GET /api/orders/:id
     */
    getOrderById = async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        try {
            const order = await this.orderService.getOrderById(Number(id));
            res.status(200).json({
                success: true,
                data: order,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Actualizar estado del pedido
     * PATCH /api/orders/:id/status
     */
    updateOrderStatus = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const [error, dto] = UpdateOrderStatusDto.create(req.body);

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const order = await this.orderService.updateOrderStatus(Number(id), dto!, req.user?.id);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Estado del pedido actualizado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Asignar responsable a pedido
     * PATCH /api/orders/:id/assign
     */
    assignResponsible = async (req: Request, res: Response) => {
        const { id } = req.params;
        const [error, dto] = AssignOrderResponsibleDto.create(req.body);

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const order = await this.orderService.assignResponsible(Number(id), dto!);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Responsable asignado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Obtener stock remoto
     * GET /api/orders/remote-stock/:variantId
     */
    getVariantStock = async (req: Request, res: Response) => {
        const { storeId, variantIds } = req.query;

        if (!storeId || isNaN(Number(storeId)) || !variantIds || typeof variantIds !== 'string') {
            return res.status(400).json({ error: 'Parámetros inválidos' });
        }

        const variantIdsArray = variantIds
            .split(',')
            .map((id) => Number(id.trim()))
            .filter((id) => !isNaN(id) && id > 0);

        if (variantIdsArray.length === 0) {
            return res.status(400).json({ error: 'Debe proporcionar al menos un variantId válido' });
        }

        try {
            const stocks = await this.orderService.getVariantStock(
                Number(storeId),
                variantIdsArray
            );
            res.status(200).json({
                success: true,
                data: stocks,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Obtener stock remoto
     * GET /api/orders/remote-stock/:variantId
     */
    getRemoteStock = async (req: Request, res: Response) => {
        const { variantId } = req.params;
        const { excludeStoreId } = req.query;

        if (!variantId || isNaN(Number(variantId)) || !excludeStoreId || isNaN(Number(excludeStoreId))) {
            return res.status(400).json({ error: 'Parámetros inválidos' });
        }

        try {
            const remoteStock = await this.orderService.getRemoteStock(
                Number(variantId),
                Number(excludeStoreId)
            );
            res.status(200).json({
                success: true,
                data: remoteStock,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Obtener reservas de una orden
     * GET /api/orders/:id/reservations
     */
    getOrderReservations = async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        try {
            const reservations = await this.orderService.getOrderReservations(Number(id));
            res.status(200).json({
                success: true,
                data: reservations,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Delegar responsabilidad de devolucion
     * PATCH /api/orders/:id/return-responsibility/delegate
     */
    delegateReturnResponsibility = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const [error, dto] = DelegateOrderReturnDto.create(req.body);

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const order = await this.orderService.delegateReturnResponsibility(Number(id), dto!, req.user?.id);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Responsabilidad de devolucion delegada exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Aceptar responsabilidad de devolucion
     * PATCH /api/orders/:id/return-responsibility/accept
     */
    acceptReturnResponsibility = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        try {
            const order = await this.orderService.acceptReturnResponsibility(Number(id), req.user?.id);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Responsabilidad de devolucion aceptada',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Obtener estado de picking por orden
     * GET /api/orders/:id/picking
     */
    getOrderPicking = async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        try {
            const picking = await this.orderService.getOrderPicking(Number(id));
            res.status(200).json({
                success: true,
                data: picking,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Iniciar picking
     * POST /api/orders/:id/picking/start
     */
    startOrderPicking = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        try {
            const picking = await this.orderService.startOrderPicking(Number(id), req.user?.id);
            res.status(200).json({
                success: true,
                data: picking,
                message: 'Picking iniciado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Actualizar picking del pedido
     * PATCH /api/orders/:id/picking
     */
    updateOrderPicking = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const body = { ...req.body, orderId: Number(id) };
        const [error, dto] = UpdateOrderPickingDto.create(body);

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (error) {
            return res.status(400).json({ error });
        }

        try {
            const order = await this.orderService.updateOrderPicking(Number(id), dto!, req.user?.id);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Picking del pedido actualizado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Actualizar un item de picking
     * PATCH /api/orders/picking/items/:itemId
     */
    updatePickingItem = async (req: AuthRequest, res: Response) => {
        const { itemId } = req.params;
        const pickedQuantity = Number(req.body?.pickedQuantity);

        if (!itemId || isNaN(Number(itemId))) {
            return res.status(400).json({ error: 'ID de item invalido' });
        }

        if (!Number.isFinite(pickedQuantity) || pickedQuantity < 0) {
            return res.status(400).json({ error: 'pickedQuantity debe ser >= 0' });
        }

        try {
            const picking = await this.orderService.updatePickingItem(Number(itemId), pickedQuantity, req.user?.id);
            res.status(200).json({
                success: true,
                data: picking,
                message: 'Item de picking actualizado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Finalizar picking de una orden
     * PATCH /api/orders/:id/picking/complete
     */
    completeOrderPicking = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID invalido' });
        }

        try {
            const order = await this.orderService.completeOrderPicking(Number(id), req.user?.id);
            res.status(200).json({
                success: true,
                data: order,
                message: 'Picking finalizado exitosamente',
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    /**
     * Reservar stock remoto
     * POST /api/orders/:id/reserve-remote
     */
    reserveRemoteStock = async (req: Request, res: Response) => {
        const { id } = req.params;
        const { sourceStoreId, variantId, quantity } = req.body;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ error: 'ID de pedido inválido' });
        }

        if (!sourceStoreId || !variantId || !quantity) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos' });
        }

        try {
            const result = await this.orderService.reserveRemoteStock(
                Number(id),
                Number(sourceStoreId),
                Number(variantId),
                Number(quantity)
            );
            res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            if (error instanceof CustomError) {
                return res.status(error.statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };
}
