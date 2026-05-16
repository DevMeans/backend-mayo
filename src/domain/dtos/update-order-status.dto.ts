export enum OrderStatusEnum {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    WAITING_TRANSFER = 'WAITING_TRANSFER',
    PREPARING = 'PREPARING',
    READY = 'READY',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED',
    WAITING_STOCK = 'WAITING_STOCK',
}

export class UpdateOrderStatusDto {
    private constructor(
        public readonly status: OrderStatusEnum,
        public readonly note?: string,
    ) {}

    static create(object: { [key: string]: any }): [string | undefined, UpdateOrderStatusDto | undefined] {
        const { status, note } = object;

        // Validar estado
        if (!status || typeof status !== 'string') {
            return ['El estado es obligatorio y debe ser una cadena válida', undefined];
        }

        const validStatuses = Object.values(OrderStatusEnum) as string[];
        if (!validStatuses.includes(status)) {
            return [
                `El estado debe ser uno de: ${validStatuses.join(', ')}`,
                undefined,
            ];
        }

        return [undefined, new UpdateOrderStatusDto(status as OrderStatusEnum, note)];
    }
}
