export class TriggerSeedDto {
    private constructor(
        public readonly key: string,
    ) {}

    static create(object: { [key: string]: unknown }): [string | undefined, TriggerSeedDto | undefined] {
        const key = object?.key;

        if (!key) {
            return ['La clave es obligatoria', undefined];
        }

        if (typeof key !== 'string') {
            return ['La clave debe ser una cadena de texto', undefined];
        }

        const normalizedKey = key.trim();
        if (!normalizedKey) {
            return ['La clave no puede estar vacia', undefined];
        }

        return [undefined, new TriggerSeedDto(normalizedKey)];
    }
}
