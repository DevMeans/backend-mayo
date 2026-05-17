import { prisma } from "../../data/prisma";
import { CustomError } from "../../domain/errors/custom.error";
import { CreateOrderDto } from "../../domain/dtos/create-order.dto";
import { UpdateOrderStatusDto, OrderStatusEnum } from "../../domain/dtos/update-order-status.dto";
import { ListOrderDto } from "../../domain/dtos/list-order.dto";
import { AssignOrderResponsibleDto } from "../../domain/dtos/assign-order-responsible.dto";
import { UpdateOrderPickingDto } from "../../domain/dtos/update-order-picking.dto";

export class OrderService {
    constructor() {}

    private detectSalesChannel(note?: string | null): 'POS' | 'ECOMMERCE' | 'INTERNAL' {
        const text = (note || '').toUpperCase();
        if (text.includes('POS-') || text.includes('METODO DE PAGO')) {
            return 'POS';
        }
        if (text.includes('ECOMMERCE')) {
            return 'ECOMMERCE';
        }
        return 'INTERNAL';
    }

    private mapOrderWithPresentationData(order: any) {
        const responsible = order.sellerUser || order.pickerUser || order.dispenserUser || null;
        const responsibleRole = order.sellerUser
            ? 'SELLER'
            : order.pickerUser
                ? 'PICKER'
                : order.dispenserUser
                    ? 'DISPENSER'
                    : null;

        return {
            ...order,
            salesChannel: this.detectSalesChannel(order.note),
            primaryResponsible: responsible
                ? {
                    id: responsible.id,
                    firstName: responsible.firstName,
                    lastName: responsible.lastName,
                    role: responsibleRole,
                }
                : null,
        };
    }

    /**
     * Generar código único para el pedido
     * Formato: ORD-{YYYYMMDD}-{RANDOM}
     */
    private generateOrderCode(): string {
        const now = new Date();
        const dateString = now.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `ORD-${dateString}-${random}`;
    }

    /**
     * Crear un nuevo pedido
     */
    async createOrder(dto: CreateOrderDto) {
        // Validar que la tienda origen existe
        const sourceStore = await prisma.store.findUnique({
            where: { id: dto.sourceStoreId },
        });
        if (!sourceStore) {
            throw CustomError.badRequest(`La tienda origen con ID ${dto.sourceStoreId} no existe`);
        }

        // Validar que la tienda de fulfillment existe si se proporciona
        if (dto.fulfillmentStoreId) {
            const fulfillmentStore = await prisma.store.findUnique({
                where: { id: dto.fulfillmentStoreId },
            });
            if (!fulfillmentStore) {
                throw CustomError.badRequest(`La tienda de fulfillment con ID ${dto.fulfillmentStoreId} no existe`);
            }
        }

        // Validar que el usuario vendedor existe si se proporciona
        if (dto.sellerUserId) {
            const seller = await prisma.user.findUnique({
                where: { id: dto.sellerUserId },
            });
            if (!seller) {
                throw CustomError.badRequest(`El usuario vendedor con ID ${dto.sellerUserId} no existe`);
            }
        }

        // Validar que todos los productos/variantes existen
        const variantIds = dto.items.map((item) => item.variantId);
        const variants = await prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
            include: { product: true },
        });

        if (variants.length !== variantIds.length) {
            throw CustomError.badRequest('Una o más variantes seleccionadas no existen');
        }

        // Validar stock disponible para cada variante
        const storeToUse = dto.fulfillmentStoreId || dto.sourceStoreId;
        for (const item of dto.items) {
            const inventory = await prisma.inventory.findUnique({
                where: {
                    storeId_variantId: {
                        storeId: storeToUse,
                        variantId: item.variantId,
                    },
                },
            });

            const availableStock = (inventory?.stock ?? 0) - (inventory?.reservedStock ?? 0);
            if (availableStock < item.quantity) {
                const variant = variants.find((v) => v.id === item.variantId);
                throw CustomError.badRequest(
                    `Stock insuficiente para ${variant?.product.name}. Disponible: ${availableStock}`
                );
            }
        }

        // Calcular totales
        const subtotal = dto.items.reduce((sum, item) => {
            return sum + item.quantity * item.unitPrice;
        }, 0);
        const tax = subtotal * 0.18; // IGV 18%
        const total = subtotal + tax;

        // Crear pedido con items
        const order = await prisma.order.create({
            data: {
                code: this.generateOrderCode(),
                status: OrderStatusEnum.PENDING,
                sourceStoreId: dto.sourceStoreId,
                fulfillmentStoreId: dto.fulfillmentStoreId ?? null,
                sellerUserId: dto.sellerUserId ?? null,
                clientName: dto.clientName ?? null,
                clientEmail: dto.clientEmail ?? null,
                clientPhone: dto.clientPhone ?? null,
                subtotal,
                tax,
                total,
                note: dto.note ?? null,
                items: {
                    create: dto.items.map((item) => ({
                        variantId: item.variantId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        subtotal: item.quantity * item.unitPrice,
                    })),
                },
            },
            include: {
                items: {
                    include: { variant: { include: { product: true, color: true, size: true } } },
                },
                sourceStore: true,
                fulfillmentStore: true,
                sellerUser: true,
            },
        });

        // Crear reservas automáticamente para cada item
        for (const item of order.items) {
            await prisma.reservation.create({
                data: {
                    quantity: item.quantity,
                    status: 'ACTIVE',
                    inventoryId: (await this.getOrCreateInventory(storeToUse, item.variantId)).id,
                    variantId: item.variantId,
                    orderId: order.id,
                    reservedById: dto.sellerUserId ?? null,
                },
            });
        }

        // Actualizar stock reservado en inventario
        for (const item of order.items) {
            const inventory = await this.getOrCreateInventory(storeToUse, item.variantId);
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: {
                    reservedStock: {
                        increment: item.quantity,
                    },
                },
            });
        }

        return order;
    }

    /**
     * Obtener o crear un registro de inventario
     */
    private async getOrCreateInventory(storeId: number, variantId: number) {
        let inventory = await prisma.inventory.findUnique({
            where: {
                storeId_variantId: {
                    storeId,
                    variantId,
                },
            },
        });

        if (!inventory) {
            inventory = await prisma.inventory.create({
                data: {
                    storeId,
                    variantId,
                    stock: 0,
                    reservedStock: 0,
                },
            });
        }

        return inventory;
    }

    /**
     * Obtener pedido por ID
     */
    async getOrderById(orderId: number) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: { variant: { include: { product: true, color: true, size: true } } },
                },
                sourceStore: true,
                fulfillmentStore: true,
                sellerUser: true,
                pickerUser: true,
                dispenserUser: true,
                pickingSession: {
                    include: {
                        assignedUser: true,
                        items: {
                            include: {
                                variant: {
                                    include: {
                                        product: true,
                                        color: true,
                                        size: true,
                                    },
                                },
                            },
                        },
                    },
                },
                transfer: true,
                reservations: {
                    include: {
                        reservedBy: true,
                        inventory: {
                            include: {
                                store: true,
                                variant: {
                                    include: {
                                        product: true,
                                        color: true,
                                        size: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }

        return this.mapOrderWithPresentationData(order);
    }

    /**
     * Listar pedidos con filtros
     */
    async listOrders(dto: ListOrderDto) {
        const andFilters: any[] = [];

        if (dto.status) {
            andFilters.push({ status: dto.status });
        }

        if (dto.storeId) {
            andFilters.push({
                OR: [
                    { sourceStoreId: dto.storeId },
                    { fulfillmentStoreId: dto.storeId },
                ],
            });
        }

        if (dto.responsibleUserId) {
            andFilters.push({
                OR: [
                    { sellerUserId: dto.responsibleUserId },
                    { pickerUserId: dto.responsibleUserId },
                    { dispenserUserId: dto.responsibleUserId },
                ],
            });
        }

        if (dto.startDate || dto.endDate) {
            const createdAt: any = {};
            if (dto.startDate) {
                createdAt.gte = dto.startDate;
            }
            if (dto.endDate) {
                createdAt.lte = dto.endDate;
            }
            andFilters.push({ createdAt });
        }

        if (dto.search) {
            andFilters.push({
                OR: [
                    { code: { contains: dto.search, mode: 'insensitive' } },
                    { clientName: { contains: dto.search, mode: 'insensitive' } },
                    { clientEmail: { contains: dto.search, mode: 'insensitive' } },
                    { clientPhone: { contains: dto.search, mode: 'insensitive' } },
                ],
            });
        }

        if (dto.channel === 'POS') {
            andFilters.push({
                OR: [
                    { note: { contains: 'POS-', mode: 'insensitive' } },
                    { note: { contains: 'METODO DE PAGO', mode: 'insensitive' } },
                ],
            });
        }

        if (dto.channel === 'ECOMMERCE') {
            andFilters.push({
                note: { contains: 'ECOMMERCE', mode: 'insensitive' },
            });
        }

        if (dto.channel === 'INTERNAL') {
            andFilters.push({
                NOT: {
                    OR: [
                        { note: { contains: 'POS-', mode: 'insensitive' } },
                        { note: { contains: 'METODO DE PAGO', mode: 'insensitive' } },
                        { note: { contains: 'ECOMMERCE', mode: 'insensitive' } },
                    ],
                },
            });
        }

        const where = andFilters.length > 0 ? { AND: andFilters } : {};

        const skip = (dto.page - 1) * dto.limit;

        const orders = await prisma.order.findMany({
            where,
            include: {
                items: {
                    include: {
                        variant: { include: { product: true, color: true, size: true } },
                    },
                },
                sourceStore: true,
                fulfillmentStore: true,
                sellerUser: true,
                pickerUser: true,
                dispenserUser: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: dto.limit,
        });

        const mappedOrders = orders.map((order) => this.mapOrderWithPresentationData(order));
        const total = await prisma.order.count({ where });

        return {
            data: mappedOrders,
            pagination: {
                page: dto.page,
                limit: dto.limit,
                total,
                totalPages: Math.ceil(total / dto.limit),
            },
        };
    }

    /**
     * Actualizar estado del pedido
     */
    async updateOrderStatus(orderId: number, dto: UpdateOrderStatusDto) {
        const order = await this.getOrderById(orderId);

        // Validar transición de estados
        const validTransitions: Record<OrderStatusEnum, OrderStatusEnum[]> = {
            [OrderStatusEnum.PENDING]: [OrderStatusEnum.CONFIRMED, OrderStatusEnum.WAITING_STOCK, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.CONFIRMED]: [OrderStatusEnum.PREPARING, OrderStatusEnum.WAITING_TRANSFER, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.WAITING_STOCK]: [OrderStatusEnum.CONFIRMED, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.WAITING_TRANSFER]: [OrderStatusEnum.PREPARING, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.PREPARING]: [OrderStatusEnum.READY, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.READY]: [OrderStatusEnum.DELIVERED, OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.DELIVERED]: [],
            [OrderStatusEnum.CANCELLED]: [],
        };

        if (!validTransitions[order.status as OrderStatusEnum].includes(dto.status as OrderStatusEnum)) {
            throw CustomError.badRequest(
                `No se puede cambiar de ${order.status} a ${dto.status}`
            );
        }

        // Si se cancela, liberar reservas
        if (dto.status === OrderStatusEnum.CANCELLED) {
            const reservations = await prisma.reservation.findMany({
                where: { orderId },
                include: { inventory: true },
            });

            for (const reservation of reservations) {
                // Liberar stock reservado
                await prisma.inventory.update({
                    where: { id: reservation.inventoryId },
                    data: { reservedStock: { decrement: reservation.quantity } },
                });

                // Marcar reserva como liberada
                await prisma.reservation.update({
                    where: { id: reservation.id },
                    data: { status: 'RELEASED' },
                });
            }
        }

        // Si se entrega, consumir reservas
        if (dto.status === OrderStatusEnum.DELIVERED) {
            const reservations = await prisma.reservation.findMany({
                where: { orderId },
                include: { inventory: true },
            });

            for (const reservation of reservations) {
                // Disminuir stock
                await prisma.inventory.update({
                    where: { id: reservation.inventoryId },
                    data: {
                        stock: { decrement: reservation.quantity },
                        reservedStock: { decrement: reservation.quantity },
                    },
                });

                // Marcar reserva como completada
                await prisma.reservation.update({
                    where: { id: reservation.id },
                    data: { status: 'COMPLETED' },
                });
            }
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
                status: dto.status,
                updatedAt: new Date(),
            },
            include: {
                items: {
                    include: { variant: { include: { product: true } } },
                },
                sourceStore: true,
                fulfillmentStore: true,
            },
        });

        return updatedOrder;
    }

    /**
     * Asignar responsable a un pedido
     */
    async assignResponsible(orderId: number, dto: AssignOrderResponsibleDto) {
        const order = await this.getOrderById(orderId);

        // Validar que el usuario existe
        const user = await prisma.user.findUnique({
            where: { id: dto.userId },
        });

        if (!user) {
            throw CustomError.badRequest(`El usuario con ID ${dto.userId} no existe`);
        }

        const updateData: any = {};

        if (dto.roleType === 'seller') {
            updateData.sellerUserId = dto.userId;
        } else if (dto.roleType === 'picker') {
            updateData.pickerUserId = dto.userId;
        } else if (dto.roleType === 'dispenser') {
            updateData.dispenserUserId = dto.userId;
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: updateData,
            include: {
                sellerUser: true,
                pickerUser: true,
                dispenserUser: true,
            },
        });

        return updatedOrder;
    }

    /**
     * Obtener stock remoto para multitienda
     */
    async getVariantStock(storeId: number, variantIds: number[]) {
        const inventories = await prisma.inventory.findMany({
            where: {
                storeId,
                variantId: { in: variantIds },
            },
        });

        const stockMap = new Map(inventories.map((inv) => [inv.variantId, inv]));

        return variantIds.map((variantId) => {
            const inventory = stockMap.get(variantId);
            const stock = inventory?.stock ?? 0;
            const reservedStock = inventory?.reservedStock ?? 0;
            return {
                variantId,
                stock,
                reservedStock,
                availableStock: stock - reservedStock,
            };
        });
    }

    async getRemoteStock(variantId: number, excludeStoreId: number) {
        const remoteStock = await prisma.inventory.findMany({
            where: {
                variantId,
                storeId: { not: excludeStoreId },
                store: { isActive: true },
            },
            include: { store: true, variant: { include: { product: true } } },
        });

        return remoteStock
            .map((inv) => ({
                storeId: inv.storeId,
                storeName: inv.store.name,
                storeType: inv.store.type,
                availableStock: inv.stock - inv.reservedStock,
                reservedStock: inv.reservedStock,
            }))
            .filter((s) => s.availableStock > 0)
            .sort((a, b) => b.availableStock - a.availableStock);
    }

    async updateOrderPicking(orderId: number, dto: UpdateOrderPickingDto) {
        const order = await this.getOrderById(orderId);

        const validPickingStatuses = [
            OrderStatusEnum.CONFIRMED,
            OrderStatusEnum.PREPARING,
            OrderStatusEnum.WAITING_TRANSFER,
        ];

        if (!validPickingStatuses.includes(order.status as OrderStatusEnum)) {
            throw CustomError.badRequest('El pedido debe estar CONFIRMED, PREPARING o WAITING_TRANSFER para actualizar el picking');
        }

        const session = await prisma.pickingSession.upsert({
            where: { orderId: order.id },
            create: { orderId: order.id, status: 'IN_PROGRESS' },
            update: { status: 'IN_PROGRESS' },
        });

        const orderItems = order.items;

        for (const item of dto.items) {
            const orderItem = orderItems.find((oi: any) => oi.variantId === item.variantId);
            if (!orderItem) {
                throw CustomError.badRequest(`La variante ${item.variantId} no pertenece al pedido`);
            }

            const existingPickingItem = await prisma.pickingItem.findFirst({
                where: {
                    sessionId: session.id,
                    variantId: item.variantId,
                },
            });

            if (existingPickingItem) {
                await prisma.pickingItem.update({
                    where: { id: existingPickingItem.id },
                    data: {
                        pickedQuantity: item.pickedQuantity,
                        quantity: orderItem.quantity,
                    },
                });
            } else {
                await prisma.pickingItem.create({
                    data: {
                        sessionId: session.id,
                        variantId: item.variantId,
                        quantity: orderItem.quantity,
                        pickedQuantity: item.pickedQuantity,
                    },
                });
            }
        }

        const allPicked = dto.items.every((item) => {
            const orderItem = orderItems.find((oi: any) => oi.variantId === item.variantId);
            return orderItem && item.pickedQuantity >= orderItem.quantity;
        });

        const pickingStatus = allPicked ? 'COMPLETED' : 'IN_PROGRESS';
        await prisma.pickingSession.update({
            where: { id: session.id },
            data: { status: pickingStatus },
        });

        const orderStatus = allPicked ? OrderStatusEnum.READY : OrderStatusEnum.PREPARING;
        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: { status: orderStatus },
            include: {
                items: {
                    include: { variant: { include: { product: true, color: true, size: true } } },
                },
                sourceStore: true,
                fulfillmentStore: true,
                sellerUser: true,
                pickerUser: true,
                dispenserUser: true,
                pickingSession: { include: { items: { include: { variant: true } } } },
            },
        });

        return updatedOrder;
    }

    /**
     * Reservar stock remoto
     */
    async reserveRemoteStock(orderId: number, sourceStoreId: number, variantId: number, quantity: number) {
        const order = await this.getOrderById(orderId);

        // Validar inventario remoto
        const remoteInventory = await prisma.inventory.findUnique({
            where: {
                storeId_variantId: {
                    storeId: sourceStoreId,
                    variantId,
                },
            },
        });

        if (!remoteInventory) {
            throw CustomError.badRequest('El inventario remoto no existe');
        }

        const availableStock = remoteInventory.stock - remoteInventory.reservedStock;
        if (availableStock < quantity) {
            throw CustomError.badRequest(`Stock remoto insuficiente. Disponible: ${availableStock}`);
        }

        // Actualizar fulfillmentStoreId
        await prisma.order.update({
            where: { id: orderId },
            data: { fulfillmentStoreId: sourceStoreId },
        });

        // Reservar stock en tienda remota
        await prisma.inventory.update({
            where: { id: remoteInventory.id },
            data: { reservedStock: { increment: quantity } },
        });

        // Crear reserva
        await prisma.reservation.create({
            data: {
                quantity,
                status: 'ACTIVE',
                inventoryId: remoteInventory.id,
                variantId,
                orderId,
            },
        });

        return { success: true, message: 'Stock remoto reservado exitosamente' };
    }
}
