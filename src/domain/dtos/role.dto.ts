export class CreateRoleDto {
    private constructor(
        public readonly name: string,
    ) { }

    static create(object: { [key: string]: any }): [string | undefined, CreateRoleDto | undefined] {
        const { name } = object;

        if (!name || typeof name !== 'string') {
            return ['El nombre del rol es obligatorio y debe ser una cadena', undefined];
        }

        return [undefined, new CreateRoleDto(name)];
    }
}

export class UpdateRoleDto {
    private constructor(
        public readonly name?: string,
    ) { }

    static create(object: { [key: string]: any }): [string | undefined, UpdateRoleDto | undefined] {
        const { name } = object;

        if (name !== undefined && typeof name !== 'string') {
            return ['El nombre del rol debe ser una cadena', undefined];
        }

        return [undefined, new UpdateRoleDto(name)];
    }
}