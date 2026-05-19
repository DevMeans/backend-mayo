import { prisma } from "../../data/prisma";
import { CustomError } from "../../domain/errors/custom.error";
import { CreateOrderDto } from "../../domain/dtos/create-order.dto";
import { UpdateOrderStatusDto, OrderStatusEnum } from "../../domain/dtos/update-order-status.dto";
import { ListOrderDto } from "../../domain/dtos/list-order.dto";
import { AssignOrderResponsibleDto } from "../../domain/dtos/assign-order-responsible.dto";
import { UpdateOrderPickingDto } from "../../domain/dtos/update-order-picking.dto";

export class OrderService {
    constructor() {}

    private resolvePreferredResponsibleUserId(...candidates: Array<number | null | undefined>): number | null {
        for (const candidate of candidates) {
            const parsed = Number(candidate);
            if (Number.isInteger(parsed) && parsed > 0) {
                return parsed;
            }
        }

        return null;
    }

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

    private resolvePickedQuantity(orderItem: any, order?: any): number {
        const pickedFromOrderItem = Number(orderItem?.picked || 0);
        if (pickedFromOrderItem > 0) {
            return pickedFromOrderItem;
        }

        const sessionItems = order?.pickingSession?.items || [];
        const pickedFromSession = sessionItems.find(
            (sessionItem: any) => Number(sessionItem.variantId) === Number(orderItem?.variantId),
        );
        return Number(pickedFromSession?.pickedQuantity || 0);
    }

    private mapPickingItemStatus(pickedQuantity: number, requestedQuantity: number): 'PENDING' | 'PARTIAL' | 'COMPLETED' {
        if (pickedQuantity <= 0) return 'PENDING';
        if (pickedQuantity >= requestedQuantity) return 'COMPLETED';
        return 'PARTIAL';
    }

    private mapOrderWithPickingSummary(order: any) {
        const items = Array.isArray(order?.items) ? order.items : [];
        const totalRequested = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
        const totalPicked = items.reduce((sum: number, item: any) => {
            const pickedQuantity = this.resolvePickedQuantity(item, order);
            return sum + Math.min(Number(item.quantity || 0), pickedQuantity);
        }, 0);

        const progress = totalRequested > 0 ? Math.round((totalPicked / totalRequested) * 100) : 0;

        return {
            ...order,
            items: items.map((item: any) => {
                const requestedQuantity = Number(item.quantity || 0);
                const pickedQuantity = this.resolvePickedQuantity(item, order);
                const pendingQuantity = Math.max(0, requestedQuantity - pickedQuantity);
                return {
                    ...item,
                    pickedQuantity,
                    pendingQuantity,
                    pickingStatus: this.mapPickingItemStatus(pickedQuantity, requestedQuantity),
                };
            }),
            pickingSummary: {
                totalRequested,
                totalPicked,
                progress,
            },
        };
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

        const baseMappedOrder = {
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

        return this.mapOrderWithPickingSummary(baseMappedOrder);
    }

    private readonly orderDetailInclude = {
        items: {
            include: { variant: { include: { product: true, color: true, size: true } } },
            orderBy: { id: 'asc' as const },
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
                    orderBy: { id: 'asc' as const },
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
    };

    private async assertOrderExists(orderId: number) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true },
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }
    }

    private mapOrderItemStatusFromPicked(pickedQuantity: number, requestedQuantity: number): 'PENDING' | 'PARTIAL' | 'PICKED' {
        if (pickedQuantity <= 0) return 'PENDING';
        if (pickedQuantity >= requestedQuantity) return 'PICKED';
        return 'PARTIAL';
    }

    private async syncPickingAndOrderStatus(orderId: number) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                pickingSession: true,
            },
        });

        if (!order || !order.pickingSession) {
            return;
        }

        const nextPickingStatus = 'IN_PROGRESS';

        await prisma.pickingSession.update({
            where: { id: order.pickingSession.id },
            data: { status: nextPickingStatus },
        });

        if (order.status === OrderStatusEnum.CANCELLED || order.status === OrderStatusEnum.DELIVERED) {
            return;
        }

        const nextOrderStatus = OrderStatusEnum.PREPARING;
        if (nextOrderStatus !== order.status) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: nextOrderStatus },
            });
        }
    }

    /**
     * Generar cÃ³digo Ãºnico para el pedido
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
            throw CustomError.badRequest('Una o mÃ¡s variantes seleccionadas no existen');
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
                        reserved: item.quantity,
                        picked: 0,
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

        // Crear reservas automÃ¡ticamente para cada item
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
            include: this.orderDetailInclude,
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
                pickingSession: {
                    include: {
                        assignedUser: true,
                        items: true,
                    },
                },
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
    async updateOrderStatus(orderId: number, dto: UpdateOrderStatusDto, responsibleUserId?: number) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                reservations: { include: { inventory: true } },
            },
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }

        // Validar transicion de estados
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
            throw CustomError.badRequest(`No se puede cambiar de ${order.status} a ${dto.status}`);
        }

        await prisma.$transaction(async (tx) => {
            if (dto.status === OrderStatusEnum.CANCELLED) {
                const activeReservations = order.reservations.filter((reservation) => reservation.status === 'ACTIVE');

                for (const reservation of activeReservations) {
                    const previousStock = Number(reservation.inventory.stock || 0);

                    await tx.inventory.update({
                        where: { id: reservation.inventoryId },
                        data: { reservedStock: { decrement: reservation.quantity } },
                    });

                    await tx.reservation.update({
                        where: { id: reservation.id },
                        data: { status: 'RELEASED' },
                    });

                    await tx.inventoryMovement.create({
                        data: {
                            type: 'UNRESERVED',
                            quantity: reservation.quantity,
                            previousStock,
                            newStock: previousStock,
                            note: `Reserva liberada por cancelacion de orden ${order.code}`,
                            responsibleUserId: responsibleUserId ?? null,
                            inventoryId: reservation.inventoryId,
                            reservationId: reservation.id,
                        },
                    });
                }

                await tx.pickingSession.updateMany({
                    where: {
                        orderId,
                        status: { in: ['PENDING', 'IN_PROGRESS'] },
                    },
                    data: { status: 'CANCELLED' },
                });
            }

            if (dto.status === OrderStatusEnum.DELIVERED) {
                const activeReservations = order.reservations.filter((reservation) => reservation.status === 'ACTIVE');

                for (const reservation of activeReservations) {
                    const previousStock = Number(reservation.inventory.stock || 0);
                    const newStock = previousStock - reservation.quantity;

                    await tx.inventory.update({
                        where: { id: reservation.inventoryId },
                        data: {
                            stock: { decrement: reservation.quantity },
                            reservedStock: { decrement: reservation.quantity },
                        },
                    });

                    await tx.reservation.update({
                        where: { id: reservation.id },
                        data: { status: 'COMPLETED' },
                    });

                    await tx.inventoryMovement.create({
                        data: {
                            type: 'OUT',
                            quantity: reservation.quantity,
                            previousStock,
                            newStock,
                            note: `Stock consumido por entrega de orden ${order.code}`,
                            responsibleUserId: responsibleUserId ?? null,
                            inventoryId: reservation.inventoryId,
                            reservationId: reservation.id,
                        },
                    });
                }

                await tx.orderItem.updateMany({
                    where: { orderId },
                    data: { status: 'PICKED' },
                });
            }

            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: dto.status,
                    updatedAt: new Date(),
                },
            });
        });

        const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: this.orderDetailInclude,
        });

        return this.mapOrderWithPresentationData(updatedOrder);
    }

    /**
     * Asignar responsable a un pedido
     */
    async assignResponsible(orderId: number, dto: AssignOrderResponsibleDto) {
        await this.getOrderById(orderId);

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

        const updatedOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.update({
                where: { id: orderId },
                data: updateData,
                include: this.orderDetailInclude,
            });

            if (dto.roleType === 'picker') {
                await tx.pickingSession.updateMany({
                    where: { orderId },
                    data: { assignedUserId: dto.userId },
                });
            }

            return order;
        });

        return this.mapOrderWithPresentationData(updatedOrder);
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

    async getOrderReservations(orderId: number) {
        await this.assertOrderExists(orderId);

        const reservations = await prisma.reservation.findMany({
            where: { orderId },
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
            orderBy: { createdAt: 'asc' },
        });

        return reservations;
    }

    async getOrderPicking(orderId: number) {
        const order = await this.getOrderById(orderId);
        const pickingSession = order?.pickingSession || null;
        const sessionItems = pickingSession?.items || [];

        const items = (order?.items || [])
            .map((item: any) => {
                const sessionItem = sessionItems.find((candidate: any) => Number(candidate.variantId) === Number(item.variantId));
                const pickedQuantity = Number(sessionItem?.pickedQuantity ?? item?.picked ?? 0);
                const requestedQuantity = Number(item?.quantity || 0);
                const missingQuantity = Math.max(0, requestedQuantity - pickedQuantity);
                const itemStatus = this.mapPickingItemStatus(pickedQuantity, requestedQuantity);

                return {
                    pickingItemId: sessionItem?.id ?? null,
                    orderItemId: item.id,
                    variantId: item.variantId,
                    requestedQuantity,
                    pickedQuantity,
                    missingQuantity,
                    status: itemStatus,
                    variant: item.variant,
                    responsibleUser: pickingSession?.assignedUser || null,
                    updatedAt: sessionItem?.createdAt || pickingSession?.updatedAt || order.updatedAt,
                };
            })
            .sort((a: any, b: any) => Number(a.orderItemId || 0) - Number(b.orderItemId || 0));

        const totalRequested = items.reduce((sum: number, item: any) => sum + item.requestedQuantity, 0);
        const totalPicked = items.reduce((sum: number, item: any) => sum + item.pickedQuantity, 0);
        const progress = totalRequested > 0 ? Math.round((totalPicked / totalRequested) * 100) : 0;

        return {
            orderId: order.id,
            orderCode: order.code,
            orderStatus: order.status,
            pickingSession: pickingSession
                ? {
                    id: pickingSession.id,
                    status: pickingSession.status,
                    assignedUser: pickingSession.assignedUser || null,
                    createdAt: pickingSession.createdAt,
                    updatedAt: pickingSession.updatedAt,
                }
                : null,
            summary: {
                totalRequested,
                totalPicked,
                progress,
                completed: items.every((item: any) => item.status === 'COMPLETED'),
            },
            items,
        };
    }

    async startOrderPicking(orderId: number, responsibleUserId?: number) {
        const order = await this.getOrderById(orderId);
        const validStatuses = [OrderStatusEnum.CONFIRMED, OrderStatusEnum.PREPARING, OrderStatusEnum.WAITING_TRANSFER];

        if (!validStatuses.includes(order.status as OrderStatusEnum)) {
            throw CustomError.badRequest('Solo pedidos CONFIRMED, PREPARING o WAITING_TRANSFER pueden iniciar picking');
        }

        const activeReservations = (order.reservations || []).filter((reservation: any) => reservation.status === 'ACTIVE');
        if (activeReservations.length === 0) {
            throw CustomError.badRequest('La orden no tiene reservas activas para iniciar picking');
        }

        const assignedUserId = this.resolvePreferredResponsibleUserId(order.pickerUserId, responsibleUserId);

        const session = await prisma.pickingSession.upsert({
            where: { orderId: order.id },
            create: {
                orderId: order.id,
                status: 'IN_PROGRESS',
                assignedUserId,
            },
            update: {
                status: 'IN_PROGRESS',
                assignedUserId,
            },
        });

        for (const item of order.items) {
            const existingPickingItem = await prisma.pickingItem.findFirst({
                where: {
                    sessionId: session.id,
                    variantId: item.variantId,
                },
            });

            if (existingPickingItem) {
                await prisma.pickingItem.update({
                    where: { id: existingPickingItem.id },
                    data: { quantity: item.quantity },
                });
                continue;
            }

            await prisma.pickingItem.create({
                data: {
                    sessionId: session.id,
                    variantId: item.variantId,
                    quantity: item.quantity,
                    pickedQuantity: Number(item.picked || 0),
                },
            });
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: OrderStatusEnum.PREPARING,
                pickerUserId: assignedUserId,
            },
        });

        return this.getOrderPicking(orderId);
    }

    async updatePickingItem(pickingItemId: number, pickedQuantity: number, responsibleUserId?: number) {
        if (!Number.isInteger(pickingItemId) || pickingItemId < 1) {
            throw CustomError.badRequest('El ID del item de picking es invalido');
        }

        if (!Number.isFinite(pickedQuantity) || pickedQuantity < 0) {
            throw CustomError.badRequest('La cantidad separada debe ser mayor o igual a 0');
        }

        const pickingItem = await prisma.pickingItem.findUnique({
            where: { id: pickingItemId },
            include: {
                session: {
                    include: {
                        order: {
                            include: {
                                items: true,
                                reservations: true,
                            },
                        },
                    },
                },
            },
        });

        if (!pickingItem || !pickingItem.session?.order) {
            throw CustomError.notFound(`No se encontro el item de picking ${pickingItemId}`);
        }

        const order = pickingItem.session.order;
        const validStatuses = [
            OrderStatusEnum.CONFIRMED,
            OrderStatusEnum.PREPARING,
            OrderStatusEnum.WAITING_TRANSFER,
            OrderStatusEnum.READY,
        ];
        if (!validStatuses.includes(order.status as OrderStatusEnum)) {
            throw CustomError.badRequest('La orden no permite actualizar picking en su estado actual');
        }

        const orderItem = order.items.find((item: any) => Number(item.variantId) === Number(pickingItem.variantId));
        if (!orderItem) {
            throw CustomError.badRequest('La variante del item de picking no pertenece a la orden');
        }

        const reservedByVariant = order.reservations
            .filter((reservation: any) =>
                Number(reservation.variantId) === Number(pickingItem.variantId) &&
                (reservation.status === 'ACTIVE' || reservation.status === 'COMPLETED'))
            .reduce((sum: number, reservation: any) => sum + Number(reservation.quantity || 0), 0);

        const maxAllowed = Math.min(Number(orderItem.quantity || 0), reservedByVariant > 0 ? reservedByVariant : Number(orderItem.quantity || 0));
        if (pickedQuantity > maxAllowed) {
            throw CustomError.badRequest(`La cantidad separada no puede superar ${maxAllowed}`);
        }

        await prisma.pickingItem.update({
            where: { id: pickingItemId },
            data: { pickedQuantity },
        });

        await prisma.orderItem.update({
            where: { id: orderItem.id },
            data: {
                picked: pickedQuantity,
                status: this.mapOrderItemStatusFromPicked(pickedQuantity, Number(orderItem.quantity || 0)),
            },
        });

        const nextPickerUserId = this.resolvePreferredResponsibleUserId(
            order.pickerUserId,
            pickingItem.session.assignedUserId,
            responsibleUserId,
        );

        const currentSessionAssignedUserId = pickingItem.session.assignedUserId ?? null;
        const currentOrderPickerUserId = order.pickerUserId ?? null;

        if (nextPickerUserId !== currentSessionAssignedUserId) {
            await prisma.pickingSession.update({
                where: { id: pickingItem.sessionId },
                data: { assignedUserId: nextPickerUserId },
            });
        }

        if (nextPickerUserId !== currentOrderPickerUserId) {
            await prisma.order.update({
                where: { id: order.id },
                data: { pickerUserId: nextPickerUserId },
            });
        }

        await this.syncPickingAndOrderStatus(order.id);
        return this.getOrderPicking(order.id);
    }

    async completeOrderPicking(orderId: number, responsibleUserId?: number) {
        const picking = await this.getOrderPicking(orderId);
        if (!picking.pickingSession) {
            throw CustomError.badRequest('La orden no tiene una sesion de picking iniciada');
        }

        const hasPendingItems = picking.items.some((item: any) => item.status !== 'COMPLETED');
        if (hasPendingItems) {
            throw CustomError.badRequest('No se puede finalizar: existen items pendientes o parciales');
        }

        const currentOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: { pickerUserId: true },
        });

        const assignedUserId = this.resolvePreferredResponsibleUserId(
            picking.pickingSession.assignedUser?.id,
            currentOrder?.pickerUserId,
            responsibleUserId,
        );

        await prisma.pickingSession.update({
            where: { id: picking.pickingSession.id },
            data: {
                status: 'COMPLETED',
                assignedUserId,
            },
        });

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: OrderStatusEnum.READY,
                pickerUserId: assignedUserId,
            },
        });

        return this.getOrderById(orderId);
    }

    async updateOrderPicking(orderId: number, dto: UpdateOrderPickingDto, responsibleUserId?: number) {
        await this.startOrderPicking(orderId);
        const currentPicking = await this.getOrderPicking(orderId);
        const pickingItemsByVariant = new Map<number, any>(
            (currentPicking.items || [])
                .filter((item: any) => Number(item.pickingItemId || 0) > 0)
                .map((item: any) => [Number(item.variantId), item]),
        );

        for (const item of dto.items) {
            const targetItem = pickingItemsByVariant.get(Number(item.variantId));
            if (!targetItem || !targetItem.pickingItemId) {
                throw CustomError.badRequest(`No existe item de picking para la variante ${item.variantId}`);
            }

            await this.updatePickingItem(
                Number(targetItem.pickingItemId),
                Number(item.pickedQuantity || 0),
                responsibleUserId,
            );
        }

        return this.getOrderById(orderId);
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
