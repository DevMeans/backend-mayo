export class CreateOrderDto {
    private constructor(
        public readonly sourceStoreId: number,
        public readonly fulfillmentStoreId?: number,
        public readonly sellerUserId?: number,
        public readonly clientName?: string,
        public readonly clientEmail?: string,
        public readonly clientPhone?: string,
        public readonly items: Array<{
            variantId: number;
            quantity: number;
            unitPrice: number;
        }> = [],
        public readonly note?: string,
    ) {}

    static create(object: { [key: string]: any }): [string | undefined, CreateOrderDto | undefined] {
        const {
            sourceStoreId,
            fulfillmentStoreId,
            sellerUserId,
            clientName,
            clientEmail,
            clientPhone,
            items = [],
            note,
        } = object;

        // Validar tienda origen
        if (!sourceStoreId || typeof sourceStoreId !== 'number' || sourceStoreId < 1) {
            return ['La tienda origen es obligatoria y debe ser un número válido', undefined];
        }

        // Validar items
        if (!Array.isArray(items) || items.length === 0) {
            return ['El pedido debe contener al menos un item', undefined];
        }

        for (const item of items) {
            if (!item.variantId || typeof item.variantId !== 'number' || item.variantId < 1) {
                return ['Cada item debe tener un variantId válido', undefined];
            }
            if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
                return ['Cada item debe tener una cantidad válida mayor a 0', undefined];
            }
            if (item.unitPrice === undefined || typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
                return ['Cada item debe tener un precio válido', undefined];
            }
        }

        // Validar email si se proporciona
        if (clientEmail && !this.isValidEmail(clientEmail)) {
            return ['El email del cliente no es válido', undefined];
        }

        return [undefined, new CreateOrderDto(
            sourceStoreId,
            fulfillmentStoreId,
            sellerUserId,
            clientName,
            clientEmail,
            clientPhone,
            items,
            note,
        )];
    }

    private static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
