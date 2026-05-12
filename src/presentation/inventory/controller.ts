import { Request, Response } from "express";
import { AuthRequest } from "../auth/middleware";
import { InventoryService } from "../services/inventory.service";
import { CustomError } from "../../domain/errors/custom.error";
import { CreateInventoryMovementDto } from "../../domain/dtos/create-inventory-movement.dto";
import { CreateStockTransferDto } from "../../domain/dtos/create-stock-transfer.dto";
import { CreateReservationDto } from "../../domain/dtos/create-reservation.dto";

export class InventoryController {
    constructor(
        private readonly inventoryService: InventoryService,
    ) { }

    private handleError(error: unknown, res: Response) {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error(error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }

    listInventories = async (req: Request, res: Response) => {
        const { skip, take, storeId, variantId, search, includeZero } = req.query;

        try {
            const options: any = {};
            if (skip !== undefined) options.skip = Number(skip);
            if (take !== undefined) options.take = Number(take);
            if (storeId !== undefined) options.storeId = Number(storeId);
            if (variantId !== undefined) options.variantId = Number(variantId);
            if (typeof search === 'string') options.search = search;
            if (includeZero !== undefined) options.includeZero = includeZero === 'true';

            const inventories = await this.inventoryService.listInventories(options);

            return res.status(200).json(inventories);
        } catch (error) {
            return this.handleError(error, res);
        }
    }

    listMovements = async (req: Request, res: Response) => {
        const { inventoryId, transferId, reservationId } = req.query;

        try {
            const filter: any = {};
            if (inventoryId !== undefined) filter.inventoryId = Number(inventoryId);
            if (transferId !== undefined) filter.transferId = Number(transferId);
            if (reservationId !== undefined) filter.reservationId = Number(reservationId);

            const movements = await this.inventoryService.listMovements(filter);

            return res.status(200).json(movements);
        } catch (error) {
            return this.handleError(error, res);
        }
    }

    listTransfers = async (req: Request, res: Response) => {
        try {
            const transfers = await this.inventoryService.listTransfers();
            return res.status(200).json(transfers);
        } catch (error) {
            return this.handleError(error, res);
        }
    }

    listReservations = async (req: Request, res: Response) => {
        try {
            const reservations = await this.inventoryService.listReservations();
            return res.status(200).json(reservations);
        } catch (error) {
            return this.handleError(error, res);
        }
    }

    createMovement = async (req: AuthRequest, res: Response) => {
        const [error, dto] = CreateInventoryMovementDto.create(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }

        if (!dto) {
            return res.status(400).json({ message: 'Datos de movimiento inválidos' });
        }

        try {
            const movement = await this.inventoryService.createMovement(dto, req.user?.id);
            return res.status(201).json(movement);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    createStockTransfer = async (req: AuthRequest, res: Response) => {
        const [error, dto] = CreateStockTransferDto.create(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }

        if (!dto) {
            return res.status(400).json({ message: 'Datos de transferencia inválidos' });
        }

        try {
            const transfer = await this.inventoryService.createStockTransfer(dto, req.user?.id);
            return res.status(201).json(transfer);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    receiveStockTransfer = async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        if (!id || isNaN(Number(id))) {
            return res.status(400).json({ message: 'El ID de la transferencia debe ser un número válido' });
        }

        try {
            const result = await this.inventoryService.receiveStockTransfer(Number(id), req.user?.id);
            return res.status(200).json(result);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    createReservation = async (req: AuthRequest, res: Response) => {
        const [error, dto] = CreateReservationDto.create(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }

        if (!dto) {
            return res.status(400).json({ message: 'Datos de reserva inválidos' });
        }

        try {
            const reservation = await this.inventoryService.createReservation(dto, req.user?.id);
            return res.status(201).json(reservation);
        } catch (err) {
            return this.handleError(err, res);
        }
    }
}
