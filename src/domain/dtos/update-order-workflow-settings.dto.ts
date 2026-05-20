export class UpdateOrderWorkflowSettingsDto {
    private constructor(
        public readonly returnResponsibilityManagementEnabled?: boolean,
        public readonly marketplacePaymentMethodsEnabled?: boolean,
        public readonly marketplacePaymentMethodIds?: number[],
    ) {}

    static create(object: { [key: string]: any }): [string | undefined, UpdateOrderWorkflowSettingsDto | undefined] {
        const rawReturnFlag = object?.returnResponsibilityManagementEnabled;
        const rawMarketplaceFlag = object?.marketplacePaymentMethodsEnabled;
        const rawMarketplaceMethodIds = object?.marketplacePaymentMethodIds;

        let returnResponsibilityManagementEnabled: boolean | undefined;
        if (rawReturnFlag !== undefined) {
            if (typeof rawReturnFlag !== 'boolean') {
                return ['returnResponsibilityManagementEnabled debe ser booleano', undefined];
            }
            returnResponsibilityManagementEnabled = rawReturnFlag;
        }

        let marketplacePaymentMethodsEnabled: boolean | undefined;
        if (rawMarketplaceFlag !== undefined) {
            if (typeof rawMarketplaceFlag !== 'boolean') {
                return ['marketplacePaymentMethodsEnabled debe ser booleano', undefined];
            }
            marketplacePaymentMethodsEnabled = rawMarketplaceFlag;
        }

        let marketplacePaymentMethodIds: number[] | undefined;
        if (rawMarketplaceMethodIds !== undefined) {
            if (!Array.isArray(rawMarketplaceMethodIds)) {
                return ['marketplacePaymentMethodIds debe ser un arreglo de ids', undefined];
            }

            const parsedIds = rawMarketplaceMethodIds.map((value: unknown) => Number(value));
            const invalidId = parsedIds.find((id) => !Number.isInteger(id) || id < 1);
            if (invalidId !== undefined) {
                return ['marketplacePaymentMethodIds contiene ids invalidos', undefined];
            }
            marketplacePaymentMethodIds = Array.from(new Set(parsedIds));
        }

        if (
            returnResponsibilityManagementEnabled === undefined
            && marketplacePaymentMethodsEnabled === undefined
            && marketplacePaymentMethodIds === undefined
        ) {
            return ['Debes enviar al menos una configuracion para actualizar', undefined];
        }

        return [
            undefined,
            new UpdateOrderWorkflowSettingsDto(
                returnResponsibilityManagementEnabled,
                marketplacePaymentMethodsEnabled,
                marketplacePaymentMethodIds,
            ),
        ];
    }
}
