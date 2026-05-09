export class CreateProductDto {
    private constructor(
        public readonly name: string,
        public readonly categoryId: number,
        public readonly description?: string,
        public readonly colorIds: number[] = [],
        public readonly sizeIds: number[] = [],
        public readonly imageUrls: string[] = [],
        public readonly variants?: Array<{
            colorId: number;
            sizeId: number;
            price: number;
            imageUrl?: string;
        }>,
    ) { }

    static create(object: { [key: string]: any }): [string | undefined, CreateProductDto | undefined] {
        const { name, categoryId, description, colorIds = [], sizeIds = [], imageUrls = [], variants } = object;

        // Validar nombre
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return ['El nombre del producto es obligatorio y debe ser una cadena válida', undefined];
        }

        // Validar categoría
        if (!categoryId || typeof categoryId !== 'number' || categoryId < 1) {
            return ['La categoría es obligatoria y debe ser un número válido', undefined];
        }

        // Validar descripción
        if (description && typeof description !== 'string') {
            return ['La descripción debe ser una cadena válida', undefined];
        }

        // Validar colores
        if (!Array.isArray(colorIds) || colorIds.length === 0) {
            return ['Debe seleccionar al menos un color', undefined];
        }

        if (!colorIds.every(id => typeof id === 'number' && id > 0)) {
            return ['Los IDs de colores deben ser números válidos', undefined];
        }

        // Validar tallas
        if (!Array.isArray(sizeIds) || sizeIds.length === 0) {
            return ['Debe seleccionar al menos una talla', undefined];
        }

        if (!sizeIds.every(id => typeof id === 'number' && id > 0)) {
            return ['Los IDs de tallas deben ser números válidos', undefined];
        }

        // Validar imágenes
        if (imageUrls && !Array.isArray(imageUrls)) {
            return ['Las imágenes deben ser un array de URLs', undefined];
        }

        if (imageUrls.some((url: any) => typeof url !== 'string')) {
            return ['Todas las imágenes deben ser URLs válidas', undefined];
        }

        // Validar variantes
        if (variants) {
            if (!Array.isArray(variants)) {
                return ['Las variantes deben ser un array', undefined];
            }

            if (variants.length === 0) {
                return ['Debe haber al menos una variante', undefined];
            }

            for (const variant of variants) {
                if (!variant.colorId || typeof variant.colorId !== 'number' || variant.colorId < 1) {
                    return ['Cada variante debe tener un colorId válido', undefined];
                }
                if (!variant.sizeId || typeof variant.sizeId !== 'number' || variant.sizeId < 1) {
                    return ['Cada variante debe tener un sizeId válido', undefined];
                }
                if (!variant.price || typeof variant.price !== 'number' || variant.price <= 0) {
                    return ['Cada variante debe tener un precio mayor a 0', undefined];
                }
                if (variant.imageUrl && typeof variant.imageUrl !== 'string') {
                    return ['La URL de la imagen de variante debe ser válida', undefined];
                }
            }
        }

        return [undefined, new CreateProductDto(
            name.trim(),
            categoryId,
            description?.trim(),
            colorIds,
            sizeIds,
            imageUrls,
            variants,
        )];
    }
}
