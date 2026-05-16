export class AssignOrderResponsibleDto {
    private constructor(
        public readonly roleType: 'seller' | 'picker' | 'dispenser',
        public readonly userId: number,
    ) {}

    static create(object: { [key: string]: any }): [string | undefined, AssignOrderResponsibleDto | undefined] {
        const { roleType, userId } = object;

        // Validar tipo de rol
        if (!roleType || !['seller', 'picker', 'dispenser'].includes(roleType)) {
            return ['El tipo de rol debe ser: seller, picker o dispenser', undefined];
        }

        // Validar usuario
        if (!userId || typeof userId !== 'number' || userId < 1) {
            return ['El usuario es obligatorio y debe ser un número válido', undefined];
        }

        return [undefined, new AssignOrderResponsibleDto(roleType as 'seller' | 'picker' | 'dispenser', userId)];
    }
}
