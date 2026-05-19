import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { OrderService } from '../services/order.service';
import { CustomError } from '../../domain/errors/custom.error';
import { PublicListProductDto } from '../../domain/dtos/public-list-product.dto';
import { CreateMarketplaceOrderDto } from '../../domain/dtos/create-marketplace-order.dto';
import { TrackMarketplaceOrderDto } from '../../domain/dtos/track-marketplace-order.dto';

export class PublicController {
    constructor(
        private readonly productService: ProductService,
        private readonly orderService: OrderService,
    ) {}

    private handleError(error: unknown, res: Response) {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error(error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }

    listProducts = async (req: Request, res: Response) => {
        const [error, dto] = PublicListProductDto.create(req.query as { [key: string]: unknown });
        if (error) {
            return res.status(400).json({ message: error });
        }

        try {
            const result = await this.productService.listPublicProducts(dto!);
            return res.status(200).json(result);
        } catch (err) {
            return this.handleError(err, res);
        }
    };

    listStores = async (_req: Request, res: Response) => {
        try {
            const stores = await this.orderService.listMarketplaceStores();
            return res.status(200).json({ data: stores });
        } catch (err) {
            return this.handleError(err, res);
        }
    };

    getProductById = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ message: 'ID de producto invalido' });
        }

        try {
            const product = await this.productService.getPublicProductById(id);
            return res.status(200).json(product);
        } catch (err) {
            return this.handleError(err, res);
        }
    };

    createMarketplaceOrder = async (req: Request, res: Response) => {
        const [error, dto] = CreateMarketplaceOrderDto.create(req.body as { [key: string]: unknown });
        if (error) {
            return res.status(400).json({ message: error });
        }

        try {
            const order = await this.orderService.createMarketplaceOrder(dto!);
            return res.status(201).json({
                success: true,
                data: order,
                message: 'Pedido registrado. Nuestro equipo confirmara disponibilidad.',
            });
        } catch (err) {
            return this.handleError(err, res);
        }
    };

    getMarketplaceOrderByCode = async (req: Request, res: Response) => {
        const rawCode = req.params.code;
        const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
        const normalizedCode = (code || '').trim().toUpperCase();
        if (!normalizedCode) {
            return res.status(400).json({ message: 'Codigo de pedido invalido' });
        }

        try {
            const order = await this.orderService.getMarketplaceOrderByCode(normalizedCode);
            return res.status(200).json({
                success: true,
                data: order,
            });
        } catch (err) {
            return this.handleError(err, res);
        }
    };

    trackMarketplaceOrder = async (req: Request, res: Response) => {
        const [error, dto] = TrackMarketplaceOrderDto.create(req.query as { [key: string]: unknown });
        if (error) {
            return res.status(400).json({ message: error });
        }

        try {
            const order = await this.orderService.trackMarketplaceOrder(dto!);
            return res.status(200).json({
                success: true,
                data: order,
            });
        } catch (err) {
            return this.handleError(err, res);
        }
    };
}
