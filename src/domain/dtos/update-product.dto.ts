export class UpdateProductDto {
    private constructor(
        public readonly name?: string,
        public readonly description?: string,
        public readonly categoryId?: number,
        public readonly isActive?: boolean,
        public readonly colorIds?: number[],
        public readonly sizeIds?: number[],
        public readonly imageUrls?: string[],
        public readonly imageFiles?: Array<{ filename: string; data: string }> ,
        public readonly variants?: Array<{
            colorId: number;
            sizeId: number;
            price: number;
            imageUrl?: string;
            imageFile?: { filename: string; data: string };
        }>,
    ) { }

    static create(object: { [key: string]: any }): [string | undefined, UpdateProductDto | undefined] {
        const {
            name,
            description,
            categoryId,
            isActive,
            colorIds,
            sizeIds,
            imageUrls,
            imageFiles,
            variants,
        } = object;

        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
            return ['El nombre del producto debe ser una cadena válida', undefined];
        }

        if (description !== undefined && typeof description !== 'string') {
            return ['La descripción debe ser una cadena válida', undefined];
        }

        if (categoryId !== undefined && (typeof categoryId !== 'number' || categoryId < 1)) {
            return ['La categoría debe ser un número válido', undefined];
        }

        if (isActive !== undefined && typeof isActive !== 'boolean') {
            return ['isActive debe ser un booleano', undefined];
        }

        if (colorIds !== undefined) {
            if (!Array.isArray(colorIds) || colorIds.length === 0) {
                return ['Debe seleccionar al menos un color', undefined];
            }
            if (!colorIds.every(id => typeof id === 'number' && id > 0)) {
                return ['Los IDs de colores deben ser números válidos', undefined];
            }
        }

        if (sizeIds !== undefined) {
            if (!Array.isArray(sizeIds) || sizeIds.length === 0) {
                return ['Debe seleccionar al menos una talla', undefined];
            }
            if (!sizeIds.every(id => typeof id === 'number' && id > 0)) {
                return ['Los IDs de tallas deben ser números válidos', undefined];
            }
        }

        if (imageUrls !== undefined) {
            if (!Array.isArray(imageUrls)) {
                return ['Las imágenes deben ser un array de URLs', undefined];
            }
            if (imageUrls.some((url: any) => typeof url !== 'string')) {
                return ['Todas las imágenes deben ser URLs válidas', undefined];
            }
        }

        if (imageFiles !== undefined) {
            if (!Array.isArray(imageFiles)) {
                return ['imageFiles debe ser un array', undefined];
            }
            for (const file of imageFiles) {
                if (!file || typeof file.filename !== 'string' || typeof file.data !== 'string') {
                    return ['Cada archivo debe incluir filename y data en base64', undefined];
                }
            }
        }

        if (variants !== undefined) {
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
                if (variant.imageUrl !== undefined && typeof variant.imageUrl !== 'string') {
                    return ['La URL de la imagen de variante debe ser válida', undefined];
                }
                if (variant.imageFile !== undefined) {
                    if (typeof variant.imageFile !== 'object' || typeof variant.imageFile.filename !== 'string' || typeof variant.imageFile.data !== 'string') {
                        return ['Cada archivo de variante debe incluir filename y data en base64', undefined];
                    }
                }
            }
        }

        return [undefined, new UpdateProductDto(
            name?.trim(),
            description?.trim(),
            categoryId,
            isActive,
            colorIds,
            sizeIds,
            imageUrls,
            imageFiles,
            variants,
        )];
    }
}
