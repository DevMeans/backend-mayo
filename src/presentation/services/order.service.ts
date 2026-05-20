import { prisma } from "../../data/prisma";
import { Prisma } from "@prisma/client";
import { CustomError } from "../../domain/errors/custom.error";
import { CreateOrderDto } from "../../domain/dtos/create-order.dto";
import { UpdateOrderStatusDto, OrderStatusEnum } from "../../domain/dtos/update-order-status.dto";
import { ListOrderDto } from "../../domain/dtos/list-order.dto";
import { AssignOrderResponsibleDto } from "../../domain/dtos/assign-order-responsible.dto";
import { UpdateOrderPickingDto } from "../../domain/dtos/update-order-picking.dto";
import { CreateMarketplaceOrderDto } from "../../domain/dtos/create-marketplace-order.dto";
import { TrackMarketplaceOrderDto } from "../../domain/dtos/track-marketplace-order.dto";
import { DelegateOrderReturnDto } from "../../domain/dtos/delegate-order-return.dto";
import { ListMarketplaceOrdersDto } from "../../domain/dtos/list-marketplace-orders.dto";
import {
    MARKETPLACE_ALLOWED_PAYMENT_METHOD_IDS_KEY,
    MARKETPLACE_PAYMENT_METHODS_ENABLED_KEY,
    RETURN_RESPONSIBILITY_MANAGEMENT_KEY,
} from "../../data/system-config-keys";

type MarketplacePaymentMethod = {
    id: number;
    name: string;
    code: string;
    displayOrder: number;
    isActive: boolean;
};

type MarketplacePaymentSettings = {
    enabled: boolean;
    allowedPaymentMethodIds: number[];
};

export class OrderService {
    constructor() {}

    private buildMarketplaceOrderScopeWhere() {
        return {
            OR: [
                { note: { contains: 'CHANNEL: ECOMMERCE', mode: 'insensitive' as const } },
                { code: { startsWith: 'MK-' } },
            ],
        };
    }

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

    private parseBooleanSetting(rawValue: string | null | undefined, fallback: boolean): boolean {
        const normalized = String(rawValue || '').trim().toLowerCase();
        if (!normalized) return fallback;
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
        return fallback;
    }

    private parseNumberArraySetting(rawValue: string | null | undefined): number[] {
        if (!rawValue) return [];

        try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
                return this.normalizePositiveIds(parsed);
            }
        } catch {
            // fallback CSV mode
        }

        return this.normalizePositiveIds(String(rawValue).split(','));
    }

    private normalizePositiveIds(values: unknown[]): number[] {
        const unique = new Set<number>();
        for (const value of values) {
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed > 0) {
                unique.add(parsed);
            }
        }
        return Array.from(unique.values());
    }

    private async getSystemSettingValue(key: string, dbClient: any = prisma): Promise<string | null> {
        const rowsRaw = await dbClient.$queryRaw(
            Prisma.sql`SELECT "value" FROM "SystemSetting" WHERE "key" = ${key} LIMIT 1`,
        );
        const rows = rowsRaw as Array<{ value: string }>;
        return rows?.[0]?.value ?? null;
    }

    private async isReturnResponsibilityManagementEnabled(dbClient: any = prisma): Promise<boolean> {
        try {
            const setting = await this.getSystemSettingValue(RETURN_RESPONSIBILITY_MANAGEMENT_KEY, dbClient);
            return this.parseBooleanSetting(setting, true);
        } catch {
            return true;
        }
    }

    private async getMarketplacePaymentSettings(dbClient: any = prisma): Promise<MarketplacePaymentSettings> {
        const [enabledRaw, allowedIdsRaw] = await Promise.all([
            this.getSystemSettingValue(MARKETPLACE_PAYMENT_METHODS_ENABLED_KEY, dbClient),
            this.getSystemSettingValue(MARKETPLACE_ALLOWED_PAYMENT_METHOD_IDS_KEY, dbClient),
        ]);

        return {
            enabled: this.parseBooleanSetting(enabledRaw, false),
            allowedPaymentMethodIds: this.parseNumberArraySetting(allowedIdsRaw),
        };
    }

    private async listActivePaymentMethods(dbClient: any = prisma): Promise<MarketplacePaymentMethod[]> {
        const rows = await dbClient.$queryRaw(
            Prisma.sql`
                SELECT
                    "id",
                    "name",
                    "code",
                    "displayOrder",
                    "isActive"
                FROM "PaymentMethod"
                WHERE "isActive" = true
                ORDER BY "displayOrder" ASC, "name" ASC
            `,
        ) as MarketplacePaymentMethod[];

        return rows.map((row) => ({
            id: Number(row.id),
            name: String(row.name),
            code: String(row.code),
            displayOrder: Number(row.displayOrder || 0),
            isActive: Boolean(row.isActive),
        }));
    }

    private filterAllowedPaymentMethods(methods: MarketplacePaymentMethod[], settings: MarketplacePaymentSettings): MarketplacePaymentMethod[] {
        if (settings.allowedPaymentMethodIds.length === 0) {
            return methods;
        }

        const allowedSet = new Set(settings.allowedPaymentMethodIds);
        const filtered = methods.filter((method) => allowedSet.has(Number(method.id)));

        return filtered.length > 0 ? filtered : methods;
    }

    private async resolveMarketplacePaymentMethod(
        paymentMethodId: number | undefined,
        dbClient: any = prisma,
    ): Promise<MarketplacePaymentMethod | null> {
        const settings = await this.getMarketplacePaymentSettings(dbClient);
        if (!settings.enabled) {
            return null;
        }

        const activeMethods = await this.listActivePaymentMethods(dbClient);
        const availableMethods = this.filterAllowedPaymentMethods(activeMethods, settings);

        if (availableMethods.length === 0) {
            throw CustomError.badRequest('No hay metodos de pago disponibles para el marketplace');
        }

        if (!paymentMethodId) {
            throw CustomError.badRequest('Selecciona un metodo de pago para continuar');
        }

        const selectedMethod = availableMethods.find((method) => Number(method.id) === Number(paymentMethodId));
        if (!selectedMethod) {
            throw CustomError.badRequest('El metodo de pago seleccionado no esta disponible');
        }

        return selectedMethod;
    }

    private mapPublicOrderStatus(status: OrderStatusEnum): 'Pedido recibido' | 'En revision' | 'Esperando stock' | 'Confirmado' | 'En preparacion' | 'Listo para entrega' | 'Entregado' | 'Cancelado pendiente de devolucion' | 'Cancelado' {
        const map: Record<OrderStatusEnum, 'Pedido recibido' | 'En revision' | 'Esperando stock' | 'Confirmado' | 'En preparacion' | 'Listo para entrega' | 'Entregado' | 'Cancelado pendiente de devolucion' | 'Cancelado'> = {
            [OrderStatusEnum.PENDING]: 'En revision',
            [OrderStatusEnum.CONFIRMED]: 'Confirmado',
            [OrderStatusEnum.WAITING_TRANSFER]: 'Esperando stock',
            [OrderStatusEnum.PREPARING]: 'En preparacion',
            [OrderStatusEnum.READY]: 'Listo para entrega',
            [OrderStatusEnum.DELIVERED]: 'Entregado',
            [OrderStatusEnum.RETURN_PENDING]: 'Cancelado pendiente de devolucion',
            [OrderStatusEnum.CANCELLED]: 'Cancelado',
            [OrderStatusEnum.WAITING_STOCK]: 'Esperando stock',
        };
        return map[status];
    }

    private mapSimpleUser(user: any) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
        };
    }

    private buildMarketplaceNote(
        dto: CreateMarketplaceOrderDto,
        autoNote?: string,
        paymentMethod?: MarketplacePaymentMethod | null,
    ): string {
        const chunks: string[] = ['CHANNEL: ECOMMERCE', 'ORIGIN: MARKETPLACE'];
        chunks.push(`DELIVERY_TYPE: ${dto.deliveryType}`);

        if (dto.companyName) chunks.push(`EMPRESA: ${dto.companyName}`);
        if (dto.ruc) chunks.push(`RUC: ${dto.ruc}`);
        if (dto.deliveryType === 'DELIVERY') {
            if (dto.deliveryAddress) chunks.push(`DIRECCION: ${dto.deliveryAddress}`);
            if (dto.deliveryReference) chunks.push(`REFERENCIA: ${dto.deliveryReference}`);
        }
        if (dto.deliveryType === 'PICKUP' && dto.pickupStoreId) {
            chunks.push(`RECOJO_TIENDA_ID: ${dto.pickupStoreId}`);
        }
        if (paymentMethod) {
            chunks.push(`METODO_PAGO_ID: ${paymentMethod.id}`);
            chunks.push(`METODO_PAGO: ${paymentMethod.name}`);
        }
        if (dto.note) chunks.push(`NOTA_CLIENTE: ${dto.note}`);
        if (autoNote) chunks.push(autoNote);

        return chunks.join(' | ');
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
                const reservedQuantity = Number(item.reserved || 0);
                const pendingStockQuantity = Math.max(0, requestedQuantity - reservedQuantity);
                const pickedQuantity = this.resolvePickedQuantity(item, order);
                const pendingPickingQuantity = Math.max(0, requestedQuantity - pickedQuantity);
                return {
                    ...item,
                    requestedQuantity,
                    reservedQuantity,
                    pendingStockQuantity,
                    pickedQuantity,
                    pendingQuantity: pendingPickingQuantity,
                    pendingPickingQuantity,
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
            returnWorkflow: order.returnRequestedAt || order.returnResponsibleUserId || order.returnResponsibilityStatus
                ? {
                    requestedAt: order.returnRequestedAt || null,
                    returnedAt: order.returnedAt || null,
                    acceptanceStatus: order.returnResponsibilityStatus || null,
                    acceptedAt: order.returnResponsibilityAcceptedAt || null,
                    cancelledBy: this.mapSimpleUser(order.cancelledByUser),
                    responsible: this.mapSimpleUser(order.returnResponsibleUser),
                    delegatedBy: this.mapSimpleUser(order.returnResponsibilityDelegatedBy),
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
        cancelledByUser: true,
        returnResponsibleUser: true,
        returnResponsibilityDelegatedBy: true,
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

        const currentStatus = String(order.status || '');
        if (
            currentStatus === OrderStatusEnum.CANCELLED ||
            currentStatus === OrderStatusEnum.DELIVERED ||
            currentStatus === OrderStatusEnum.RETURN_PENDING
        ) {
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

    async createMarketplaceOrder(dto: CreateMarketplaceOrderDto) {
        const selectedPaymentMethod = await this.resolveMarketplacePaymentMethod(dto.paymentMethodId);

        const sourceStore = await prisma.store.findFirst({
            where: { id: dto.sourceStoreId, isActive: true },
        });
        if (!sourceStore) {
            throw CustomError.badRequest(`La tienda origen con ID ${dto.sourceStoreId} no existe o esta inactiva`);
        }

        if (dto.pickupStoreId) {
            const pickupStore = await prisma.store.findFirst({
                where: { id: dto.pickupStoreId, isActive: true },
            });
            if (!pickupStore) {
                throw CustomError.badRequest('La tienda de recojo no existe o esta inactiva');
            }
        }

        const variantIds = dto.items.map((item) => item.variantId);
        const variants = await prisma.productVariant.findMany({
            where: {
                id: { in: variantIds },
                isActive: true,
                product: { isActive: true },
            },
            include: {
                product: true,
            },
        });

        if (variants.length !== variantIds.length) {
            throw CustomError.badRequest('Una o mas variantes seleccionadas no existen o estan inactivas');
        }

        const variantMap = new Map<number, typeof variants[number]>();
        variants.forEach((variant) => variantMap.set(variant.id, variant));

        const orderCode = this.generateOrderCode().replace('ORD-', 'MK-');
        const normalizedClientName = dto.companyName
            ? `${dto.clientName} (${dto.companyName})`
            : dto.clientName;

        const summary = await prisma.$transaction(async (tx) => {
            const calculatedItems: Array<{
                variantId: number;
                requestedQuantity: number;
                reservedQuantity: number;
                pendingQuantity: number;
                availableStock: number;
                unitPrice: number;
                lineSubtotal: number;
                inventoryId: number;
            }> = [];
            let subtotal = 0;
            let totalRequested = 0;
            let totalReserved = 0;
            let totalPending = 0;

            for (const item of dto.items) {
                const variant = variantMap.get(item.variantId);
                if (!variant) {
                    throw CustomError.badRequest(`Variante ${item.variantId} no encontrada`);
                }

                const inventory = await tx.inventory.upsert({
                    where: {
                        storeId_variantId: {
                            storeId: dto.sourceStoreId,
                            variantId: item.variantId,
                        },
                    },
                    create: {
                        storeId: dto.sourceStoreId,
                        variantId: item.variantId,
                        stock: 0,
                        reservedStock: 0,
                    },
                    update: {},
                });

                const availableStock = Math.max(0, Number(inventory.stock || 0) - Number(inventory.reservedStock || 0));
                const requestedQuantity = Number(item.quantity || 0);
                const reservedQuantity = Math.max(0, Math.min(requestedQuantity, availableStock));
                const pendingQuantity = Math.max(0, requestedQuantity - reservedQuantity);
                const unitPrice = Number(item.unitPrice ?? variant.price ?? 0);
                const lineSubtotal = requestedQuantity * unitPrice;

                totalRequested += requestedQuantity;
                totalReserved += reservedQuantity;
                totalPending += pendingQuantity;
                subtotal += lineSubtotal;

                calculatedItems.push({
                    variantId: item.variantId,
                    requestedQuantity,
                    reservedQuantity,
                    pendingQuantity,
                    availableStock,
                    unitPrice,
                    lineSubtotal,
                    inventoryId: inventory.id,
                });
            }

            const tax = subtotal * 0.18;
            const total = subtotal + tax;
            const status = totalPending > 0 ? OrderStatusEnum.WAITING_STOCK : OrderStatusEnum.CONFIRMED;

            const order = await tx.order.create({
                data: {
                    code: orderCode,
                    status,
                    sourceStoreId: dto.sourceStoreId,
                    fulfillmentStoreId: dto.sourceStoreId,
                    clientName: normalizedClientName,
                    clientEmail: dto.clientEmail ?? null,
                    clientPhone: dto.clientPhone,
                    subtotal,
                    tax,
                    total,
                    note: this.buildMarketplaceNote(
                        dto,
                        totalPending > 0
                            ? `RESERVA: parcial. Pendiente ${totalPending} unidades`
                            : 'RESERVA: completa',
                        selectedPaymentMethod,
                    ),
                    items: {
                        create: calculatedItems.map((item) => ({
                            variantId: item.variantId,
                            quantity: item.requestedQuantity,
                            reserved: item.reservedQuantity,
                            picked: 0,
                            unitPrice: item.unitPrice,
                            subtotal: item.lineSubtotal,
                            status: item.reservedQuantity >= item.requestedQuantity
                                ? 'PENDING'
                                : (item.reservedQuantity > 0 ? 'PARTIAL' : 'PENDING'),
                        })),
                    },
                },
                include: {
                    items: true,
                    sourceStore: true,
                    fulfillmentStore: true,
                },
            });

            for (const item of calculatedItems) {
                if (item.reservedQuantity <= 0) {
                    continue;
                }

                await tx.reservation.create({
                    data: {
                        quantity: item.reservedQuantity,
                        status: 'ACTIVE',
                        inventoryId: item.inventoryId,
                        variantId: item.variantId,
                        orderId: order.id,
                    },
                });

                await tx.inventory.update({
                    where: { id: item.inventoryId },
                    data: {
                        reservedStock: {
                            increment: item.reservedQuantity,
                        },
                    },
                });
            }

            const detailedOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: this.orderDetailInclude,
            });

            if (!detailedOrder) {
                throw CustomError.internal('No se pudo recuperar el pedido marketplace creado');
            }

            return {
                order: detailedOrder,
                metrics: {
                    totalRequested,
                    totalReserved,
                    totalPending,
                },
            };
        });

        return {
            ...this.mapOrderWithPresentationData(summary.order),
            stockSummary: summary.metrics,
            reviewMessage: 'Pedido sujeto a confirmacion de disponibilidad',
        };
    }

    async getMarketplaceOrderByCode(code: string) {
        const order = await prisma.order.findFirst({
            where: {
                code,
                ...this.buildMarketplaceOrderScopeWhere(),
            },
            include: this.orderDetailInclude,
        });

        if (!order) {
            throw CustomError.notFound('Pedido no encontrado');
        }

        const mapped = this.mapOrderWithPresentationData(order);
        return {
            code: mapped.code,
            status: mapped.status,
            publicStatus: this.mapPublicOrderStatus(mapped.status as OrderStatusEnum),
            createdAt: mapped.createdAt,
            clientName: mapped.clientName,
            clientPhone: mapped.clientPhone,
            totals: {
                subtotal: Number(mapped.subtotal || 0),
                tax: Number(mapped.tax || 0),
                total: Number(mapped.total || 0),
            },
            items: (mapped.items || []).map((item: any) => ({
                variantId: item.variantId,
                productName: item.variant?.product?.name || 'Producto',
                colorName: item.variant?.color?.name || 'Sin color',
                sizeName: item.variant?.size?.name || 'Sin talla',
                requestedQuantity: Number(item.requestedQuantity ?? item.quantity ?? 0),
                reservedQuantity: Number(item.reservedQuantity ?? item.reserved ?? 0),
                pendingQuantity: Number(item.pendingStockQuantity ?? 0),
                unitPrice: Number(item.unitPrice || 0),
                subtotal: Number(item.subtotal || 0),
            })),
            reviewMessage: 'Pedido recibido. Nuestro equipo revisara disponibilidad y te contactara.',
        };
    }

    async trackMarketplaceOrder(dto: TrackMarketplaceOrderDto) {
        const order = await prisma.order.findFirst({
            where: {
                code: dto.code,
                clientPhone: dto.phone,
                ...this.buildMarketplaceOrderScopeWhere(),
            },
            include: this.orderDetailInclude,
        });

        if (!order) {
            throw CustomError.notFound('No se encontro un pedido con esos datos');
        }

        const mapped = this.mapOrderWithPresentationData(order);
        const items: Array<{
            productName: string;
            colorName: string;
            sizeName: string;
            requestedQuantity: number;
            reservedQuantity: number;
            pendingQuantity: number;
        }> = (mapped.items || []).map((item: any) => ({
            productName: item.variant?.product?.name || 'Producto',
            colorName: item.variant?.color?.name || 'Sin color',
            sizeName: item.variant?.size?.name || 'Sin talla',
            requestedQuantity: Number(item.requestedQuantity ?? item.quantity ?? 0),
            reservedQuantity: Number(item.reservedQuantity ?? item.reserved ?? 0),
            pendingQuantity: Number(item.pendingStockQuantity ?? 0),
        }));

        const hasPending = items.some((item: { pendingQuantity: number }) => item.pendingQuantity > 0);
        return {
            code: mapped.code,
            status: mapped.status,
            publicStatus: this.mapPublicOrderStatus(mapped.status as OrderStatusEnum),
            createdAt: mapped.createdAt,
            items,
            hasPending,
            reviewMessage: hasPending
                ? 'Pedido en revision: hay cantidades pendientes por confirmar'
                : 'Pedido confirmado para preparacion',
        };
    }

    async listMarketplaceOrders(dto: ListMarketplaceOrdersDto) {
        const orders = await prisma.order.findMany({
            where: {
                clientPhone: dto.phone,
                ...(dto.email ? { clientEmail: dto.email } : {}),
                ...this.buildMarketplaceOrderScopeWhere(),
            },
            include: {
                items: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: dto.take,
        });

        return this.mapMarketplaceOrderSummaries(orders);
    }

    async listMarketplaceOrdersByCustomerProfile(customer: { phone: string; email: string }, take: number = 20) {
        const phone = String(customer.phone || '').trim();
        const email = String(customer.email || '').trim().toLowerCase();

        if (!phone && !email) {
            return [];
        }

        const fallbackOr: Array<any> = [];
        if (phone) {
            fallbackOr.push({ clientPhone: phone });
        }
        if (email) {
            fallbackOr.push({ clientEmail: { equals: email, mode: 'insensitive' as const } });
        }

        if (fallbackOr.length === 0) {
            return [];
        }

        const orders = await prisma.order.findMany({
            where: {
                AND: [
                    { OR: fallbackOr },
                    this.buildMarketplaceOrderScopeWhere(),
                ],
            },
            include: {
                items: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take,
        });

        return this.mapMarketplaceOrderSummaries(orders);
    }

    async getMarketplaceCheckoutPaymentMethods() {
        const settings = await this.getMarketplacePaymentSettings();
        const activeMethods = await this.listActivePaymentMethods();
        const availableMethods = settings.enabled
            ? this.filterAllowedPaymentMethods(activeMethods, settings)
            : [];

        return {
            enabled: settings.enabled,
            methods: availableMethods.map((method) => ({
                id: method.id,
                name: method.name,
                code: method.code,
            })),
        };
    }

    private mapMarketplaceOrderSummaries(orders: Array<any>) {
        return orders.map((order) => {
            const totalRequested = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
            const totalReserved = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.reserved || 0), 0);
            const pendingUnits = Math.max(0, totalRequested - totalReserved);
            const hasPending = pendingUnits > 0;

            return {
                code: order.code,
                status: order.status,
                publicStatus: this.mapPublicOrderStatus(order.status as OrderStatusEnum),
                createdAt: order.createdAt,
                totals: {
                    subtotal: Number(order.subtotal || 0),
                    tax: Number(order.tax || 0),
                    total: Number(order.total || 0),
                },
                requestedUnits: totalRequested,
                reservedUnits: totalReserved,
                pendingUnits,
                hasPending,
                reviewMessage: hasPending
                    ? 'Pedido en revision: hay cantidades pendientes por confirmar'
                    : 'Pedido confirmado para preparacion',
            };
        });
    }

    async listMarketplaceStores() {
        const stores = await prisma.store.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                code: true,
                type: true,
            },
            orderBy: { name: 'asc' },
        });

        return stores;
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
                    { returnResponsibleUserId: dto.responsibleUserId },
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
                cancelledByUser: true,
                returnResponsibleUser: true,
                returnResponsibilityDelegatedBy: true,
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
        const order: any = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                reservations: { include: { inventory: true } },
            },
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }

        const currentStatus = order.status as OrderStatusEnum;
        const targetStatus = dto.status as OrderStatusEnum;

        // Validar transicion de estados
        const validTransitions: Record<OrderStatusEnum, OrderStatusEnum[]> = {
            [OrderStatusEnum.PENDING]: [OrderStatusEnum.CONFIRMED, OrderStatusEnum.WAITING_STOCK, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.CONFIRMED]: [OrderStatusEnum.PREPARING, OrderStatusEnum.WAITING_TRANSFER, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.WAITING_STOCK]: [OrderStatusEnum.CONFIRMED, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.WAITING_TRANSFER]: [OrderStatusEnum.PREPARING, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.PREPARING]: [OrderStatusEnum.READY, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.READY]: [OrderStatusEnum.DELIVERED, OrderStatusEnum.CANCELLED, OrderStatusEnum.RETURN_PENDING],
            [OrderStatusEnum.DELIVERED]: [],
            [OrderStatusEnum.RETURN_PENDING]: [OrderStatusEnum.CANCELLED],
            [OrderStatusEnum.CANCELLED]: [],
        };

        if (!validTransitions[currentStatus].includes(targetStatus)) {
            throw CustomError.badRequest(`No se puede cambiar de ${order.status} a ${dto.status}`);
        }

        const returnResponsibilityManagementEnabled = await this.isReturnResponsibilityManagementEnabled();

        await prisma.$transaction(async (tx) => {
            const isReturnCompletion = currentStatus === OrderStatusEnum.RETURN_PENDING && targetStatus === OrderStatusEnum.CANCELLED;
            const isCancellationRequest = (targetStatus === OrderStatusEnum.CANCELLED && currentStatus !== OrderStatusEnum.RETURN_PENDING)
                || targetStatus === OrderStatusEnum.RETURN_PENDING;
            const activeReservations = order.reservations.filter((reservation: any) => reservation.status === 'ACTIVE');
            const totalPickedUnits = order.items.reduce((sum: number, item: any) => {
                const picked = Number(item?.picked || 0);
                return sum + Math.max(0, picked);
            }, 0);
            const hasPickedUnits = totalPickedUnits > 0;

            let nextOrderStatus = targetStatus;
            const orderUpdateData: any = { updatedAt: new Date() };

            const releaseActiveReservations = async (actorUserId: number | null, note: string) => {
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
                            note,
                            responsibleUserId: actorUserId,
                            inventoryId: reservation.inventoryId,
                            reservationId: reservation.id,
                        },
                    });
                }
            };

            if (isCancellationRequest) {
                const cancelledById = this.resolvePreferredResponsibleUserId(
                    responsibleUserId,
                    order.dispenserUserId,
                    order.pickerUserId,
                    order.sellerUserId,
                );

                if (!cancelledById) {
                    throw CustomError.badRequest('No se pudo identificar al usuario que cancela para asignar la devolucion');
                }

                orderUpdateData.cancelledByUserId = cancelledById;

                await tx.pickingSession.updateMany({
                    where: {
                        orderId,
                        status: { in: ['PENDING', 'IN_PROGRESS'] },
                    },
                    data: { status: 'CANCELLED' },
                });

                if (!hasPickedUnits) {
                    await releaseActiveReservations(
                        cancelledById,
                        `Reserva liberada automaticamente por cancelacion sin picking de orden ${order.code}`,
                    );

                    nextOrderStatus = OrderStatusEnum.CANCELLED;
                    orderUpdateData.returnResponsibleUserId = null;
                    orderUpdateData.returnResponsibilityDelegatedById = null;
                    orderUpdateData.returnResponsibilityStatus = null;
                    orderUpdateData.returnRequestedAt = null;
                    orderUpdateData.returnResponsibilityAcceptedAt = null;
                    orderUpdateData.returnedAt = null;
                } else {
                    nextOrderStatus = OrderStatusEnum.RETURN_PENDING;
                    orderUpdateData.returnResponsibleUserId = returnResponsibilityManagementEnabled ? cancelledById : null;
                    orderUpdateData.returnResponsibilityDelegatedById = null;
                    orderUpdateData.returnResponsibilityStatus = returnResponsibilityManagementEnabled ? 'ACCEPTED' : null;
                    orderUpdateData.returnRequestedAt = new Date();
                    orderUpdateData.returnResponsibilityAcceptedAt = returnResponsibilityManagementEnabled ? new Date() : null;
                    orderUpdateData.returnedAt = null;
                }
            }

            if (isReturnCompletion) {
                let actorUserId = this.resolvePreferredResponsibleUserId(responsibleUserId);

                if (returnResponsibilityManagementEnabled) {
                    const expectedResponsibleUserId = Number(order.returnResponsibleUserId || 0);

                    if (!expectedResponsibleUserId) {
                        throw CustomError.badRequest('El pedido no tiene responsable de devolucion asignado');
                    }

                    if (!actorUserId) {
                        throw CustomError.unauthorized('No se pudo identificar al usuario responsable de la devolucion');
                    }

                    if (actorUserId !== expectedResponsibleUserId) {
                        throw CustomError.forbidden('Solo el responsable de devolucion puede cerrar la cancelacion');
                    }

                    if (order.returnResponsibilityStatus !== 'ACCEPTED') {
                        throw CustomError.badRequest('La responsabilidad de devolucion debe estar aceptada antes de finalizar');
                    }
                } else {
                    actorUserId = this.resolvePreferredResponsibleUserId(
                        responsibleUserId,
                        order.dispenserUserId,
                        order.pickerUserId,
                        order.sellerUserId,
                        order.cancelledByUserId,
                    );
                }

                await releaseActiveReservations(actorUserId, `Reserva liberada por devolucion de orden ${order.code}`);

                await tx.pickingSession.updateMany({
                    where: {
                        orderId,
                        status: { in: ['PENDING', 'IN_PROGRESS'] },
                    },
                    data: { status: 'CANCELLED' },
                });

                orderUpdateData.returnedAt = new Date();
            }

            if (targetStatus === OrderStatusEnum.DELIVERED) {
                const activeReservations = order.reservations.filter((reservation: any) => reservation.status === 'ACTIVE');

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
                            responsibleUserId: responsibleUserId ?? order.dispenserUserId ?? null,
                            inventoryId: reservation.inventoryId,
                            reservationId: reservation.id,
                        },
                    });
                }

                await tx.orderItem.updateMany({
                    where: { orderId },
                    data: { status: 'PICKED' },
                });

                orderUpdateData.returnRequestedAt = null;
                orderUpdateData.returnedAt = null;
                orderUpdateData.returnResponsibleUserId = null;
                orderUpdateData.returnResponsibilityDelegatedById = null;
                orderUpdateData.returnResponsibilityStatus = null;
                orderUpdateData.returnResponsibilityAcceptedAt = null;
            }

            orderUpdateData.status = nextOrderStatus;

            await tx.order.update({
                where: { id: orderId },
                data: orderUpdateData,
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
     * Delegar responsabilidad de devolucion de una orden cancelada
     */
    async delegateReturnResponsibility(orderId: number, dto: DelegateOrderReturnDto, delegatedByUserId?: number) {
        const returnResponsibilityManagementEnabled = await this.isReturnResponsibilityManagementEnabled();
        if (!returnResponsibilityManagementEnabled) {
            throw CustomError.badRequest('La gestion de responsabilidades de devolucion esta desactivada en configuracion');
        }

        const actorId = this.resolvePreferredResponsibleUserId(delegatedByUserId);
        if (!actorId) {
            throw CustomError.unauthorized('No se pudo identificar al usuario que delega la devolucion');
        }

        const order: any = await prisma.order.findUnique({
            where: { id: orderId },
            include: this.orderDetailInclude,
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }

        if ((order.status as OrderStatusEnum) !== OrderStatusEnum.RETURN_PENDING) {
            throw CustomError.badRequest('Solo pedidos en devolucion pendiente permiten delegar responsabilidad');
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: dto.userId },
        });

        if (!targetUser) {
            throw CustomError.badRequest(`El usuario con ID ${dto.userId} no existe`);
        }

        const canDelegate = actorId === Number(order.returnResponsibleUserId || 0)
            || actorId === Number(order.cancelledByUserId || 0);

        if (!canDelegate) {
            throw CustomError.forbidden('Solo quien cancelo o el responsable actual pueden delegar la devolucion');
        }

        const isSelfAssignment = actorId === dto.userId;

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
                returnResponsibleUserId: dto.userId,
                returnResponsibilityDelegatedById: actorId,
                returnResponsibilityStatus: isSelfAssignment ? 'ACCEPTED' : 'PENDING',
                returnResponsibilityAcceptedAt: isSelfAssignment ? new Date() : null,
                updatedAt: new Date(),
            },
            include: this.orderDetailInclude,
        });

        return this.mapOrderWithPresentationData(updatedOrder);
    }

    /**
     * Aceptar responsabilidad de devolucion
     */
    async acceptReturnResponsibility(orderId: number, userId?: number) {
        const returnResponsibilityManagementEnabled = await this.isReturnResponsibilityManagementEnabled();
        if (!returnResponsibilityManagementEnabled) {
            throw CustomError.badRequest('La gestion de responsabilidades de devolucion esta desactivada en configuracion');
        }

        const actorId = this.resolvePreferredResponsibleUserId(userId);
        if (!actorId) {
            throw CustomError.unauthorized('No se pudo identificar al usuario que acepta la devolucion');
        }

        const order: any = await prisma.order.findUnique({
            where: { id: orderId },
            include: this.orderDetailInclude,
        });

        if (!order) {
            throw CustomError.notFound(`El pedido con ID ${orderId} no existe`);
        }

        if ((order.status as OrderStatusEnum) !== OrderStatusEnum.RETURN_PENDING) {
            throw CustomError.badRequest('Solo pedidos en devolucion pendiente permiten aceptar responsabilidad');
        }

        if (Number(order.returnResponsibleUserId || 0) !== actorId) {
            throw CustomError.forbidden('Solo el responsable asignado puede aceptar la devolucion');
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
                returnResponsibilityStatus: 'ACCEPTED',
                returnResponsibilityAcceptedAt: new Date(),
                updatedAt: new Date(),
            },
            include: this.orderDetailInclude,
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
