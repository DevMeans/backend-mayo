import { CreateProductDto } from "../../domain/dtos/create-product.dto";
import { UpdateProductDto } from "../../domain/dtos/update-product.dto";
import { ListProductDto } from "../../domain/dtos/list-product.dto";
import { GenerateVariantsDto } from "../../domain/dtos/generate-variants.dto";
import { prisma } from "../../data/prisma";
import { Prisma } from "@prisma/client";
import { CustomError } from "../../domain/errors/custom.error";
import { ProductEntity } from "../../domain/entities/product.entity";
import { ProductVariantEntity } from "../../domain/entities/product-variant.entity";
import { ProductImageEntity } from "../../domain/entities/product-image.entity";
import { cloudinary } from "../../config/cloudinary";

export class ProductService {
    constructor() { }

    /**
     * Generar SKU único
     * Formato: PROD-{PRODUCTID}-{COLORID}-{SIZEID}
     */
    private generateSKU(productId: number, colorId: number, sizeId: number): string {
        return `PROD-${productId.toString().padStart(5, '0')}-${colorId.toString().padStart(3, '0')}-${sizeId.toString().padStart(3, '0')}`;
    }

    /**
     * Validar que una categoría existe
     */
    private async validateCategory(categoryId: number): Promise<void> {
        const category = await prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) {
            throw CustomError.badRequest(`La categoría con ID ${categoryId} no existe`);
        }
    }

    /**
     * Validar que los colores existan
     */
    private async validateColors(colorIds: number[]): Promise<void> {
        const colors = await prisma.color.findMany({
            where: { id: { in: colorIds }, isActive: true },
        });
        if (colors.length !== colorIds.length) {
            throw CustomError.badRequest('Uno o más colores seleccionados no existen o están inactivos');
        }
    }

    /**
     * Validar que las tallas existan
     */
    private async validateSizes(sizeIds: number[]): Promise<void> {
        const sizes = await prisma.size.findMany({
            where: { id: { in: sizeIds }, isActive: true },
        });
        if (sizes.length !== sizeIds.length) {
            throw CustomError.badRequest('Una o más tallas seleccionadas no existen o están inactivas');
        }
    }

    /**
     * Generar todas las combinaciones posibles de variantes (producto cartesiano)
     */
    private generateVariantCombinations(
        colorIds: number[],
        sizeIds: number[],
    ): Array<{ colorId: number; sizeId: number }> {
        const combinations: Array<{ colorId: number; sizeId: number }> = [];
        for (const colorId of colorIds) {
            for (const sizeId of sizeIds) {
                combinations.push({ colorId, sizeId });
            }
        }
        return combinations;
    }

    private async uploadBase64Image(data: string, publicId: string): Promise<string> {
        const payload = data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;

        try {
            const uploadResult = await cloudinary.uploader.upload(payload, {
                folder: 'product_images',
                public_id: publicId,
                overwrite: true,
                resource_type: 'image',
            });

            return uploadResult.secure_url;
        } catch (error) {
            console.error('Error subiendo imagen a Cloudinary:', error);
            throw CustomError.internal('Error al subir la imagen');
        }
    }

    private extractPublicIdFromUrl(url: string): string | null {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            const filenameWithExt = pathParts[pathParts.length - 1];
            const filename = filenameWithExt.split('?')[0];
            const publicId = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
            const folder = pathParts[pathParts.length - 2];

            if (!folder || !publicId) {
                return null;
            }

            return `${folder}/${publicId}`;
        } catch {
            return null;
        }
    }

    private async deleteCloudinaryUrl(url: string): Promise<void> {
        const publicId = this.extractPublicIdFromUrl(url);
        if (!publicId) {
            return;
        }

        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            console.log(`Imagen ${publicId} eliminada de Cloudinary`);
        } catch (error) {
            console.error(`Error eliminando imagen de Cloudinary ${publicId}:`, error);
        }
    }

    async deleteImageFromCloudinary(publicId: string): Promise<void> {
        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            await prisma.productImage.deleteMany({ where: { url: { contains: publicId } } });
            console.log(`Imagen ${publicId} eliminada de Cloudinary y de la base de datos`);
        } catch (error) {
            console.error('Error eliminando imagen de Cloudinary:', error);
            throw CustomError.internal('Error al eliminar la imagen');
        }
    }

    private async uploadProductFiles(productId: number, imageFiles: Array<{ filename: string; data: string }> = []): Promise<string[]> {
        if (!imageFiles || imageFiles.length === 0) {
            return [];
        }

        const urls: string[] = [];
        for (const file of imageFiles) {
            const publicId = `product_${productId}_${file.filename.replace(/\.[^/.]+$/, '')}`;
            const uploadedUrl = await this.uploadBase64Image(file.data, publicId);
            urls.push(uploadedUrl);
        }

        return urls;
    }

    private async uploadVariantImage(productId: number, variant: { colorId: number; sizeId: number; imageUrl?: string; imageFile?: { filename: string; data: string } }): Promise<string | null> {
        if (variant.imageFile) {
            const publicId = `product_${productId}_variant_${variant.colorId}_${variant.sizeId}_${variant.imageFile.filename.replace(/\.[^/.]+$/, '')}`;
            return await this.uploadBase64Image(variant.imageFile.data, publicId);
        }

        return variant.imageUrl ? variant.imageUrl : null;
    }

    /**
     * Crear un nuevo producto con variantes e imágenes
     */
    async createProduct(createProductDto: CreateProductDto): Promise<any> {
        const { name, categoryId, description, colorIds, sizeIds, imageUrls = [], imageFiles = [], variants } = createProductDto;

        console.log('Creando producto con datos:', {
            name,
            categoryId,
            description,
            colorIds,
            sizeIds,
            imageUrls,
            imageFilesCount: imageFiles.length,
            variantsCount: variants?.length
        });

        try {
            // Validar que la categoría existe
            await this.validateCategory(categoryId);

            // Validar que los colores existen
            await this.validateColors(colorIds);

            // Validar que las tallas existen
            await this.validateSizes(sizeIds);

            // Validar que hay variantes
            if (!variants || variants.length === 0) {
                throw CustomError.badRequest('Debe haber al menos una variante para crear el producto');
            }

            const now = new Date();

            // Crear el producto
            const product = await prisma.product.create({
                data: {
                    name,
                    description: description || null,
                    categoryId,
                    isActive: true,
                    updatedAt: now,
                },
            });

            // Subir imágenes de producto a Cloudinary si se recibieron archivos
            const uploadedProductImageUrls = await this.uploadProductFiles(product.id, imageFiles);
            const allImageUrls = [...new Set([...(imageUrls || []), ...uploadedProductImageUrls])];

            // Crear las imágenes del producto
            if (allImageUrls.length > 0) {
                await prisma.productImage.createMany({
                    data: allImageUrls.map((url: string) => ({
                        url,
                        productId: product.id,
                    })),
                });
            }

            // Crear las variantes
            const createdVariants = await Promise.all(
                variants.map(async variant => {
                    const imageUrl = await this.uploadVariantImage(product.id, variant);
                    return prisma.productVariant.create({
                        data: {
                            sku: this.generateSKU(product.id, variant.colorId, variant.sizeId),
                            price: new Prisma.Decimal(String(variant.price)),
                            colorId: variant.colorId,
                            sizeId: variant.sizeId,
                            imageUrl: imageUrl || null,
                            productId: product.id,
                            isActive: true,
                            updatedAt: now,
                        },
                    });
                }),
            );

            return {
                product: {
                    ...ProductEntity.fromObject(product),
                    variantCount: createdVariants.length,
                    imageCount: allImageUrls.length,
                },
                variants: createdVariants.map(v => ProductVariantEntity.fromObject(v)),
                images: allImageUrls,
                message: `Producto "${name}" creado exitosamente con ${createdVariants.length} variantes`,
            };
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }
            console.error('Error al crear el producto:', error);
            throw CustomError.internal('Error al crear el producto');
        }
    }

    /**
     * Generar automáticamente variantes basadas en colores y tallas seleccionados
     */
    async generateVariants(generateVariantsDto: GenerateVariantsDto): Promise<Array<{ colorId: number; sizeId: number }>> {
        const { colorIds, sizeIds } = generateVariantsDto;

        try {
            // Validar que los colores existen
            await this.validateColors(colorIds);

            // Validar que las tallas existen
            await this.validateSizes(sizeIds);

            // Generar todas las combinaciones
            const combinations = this.generateVariantCombinations(colorIds, sizeIds);

            return combinations;
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }
            throw CustomError.internal('Error al generar variantes');
        }
    }

    /**
     * Listar productos con búsqueda y filtros
     */
    async listProducts(listProductDto: ListProductDto): Promise<any> {
        const { skip = 1, take = 10, search, isActive = true } = listProductDto;

        try {
            const where: any = {};

            // Filtro por estado
            if (isActive !== undefined) {
                where.isActive = isActive;
            }

            // Búsqueda parcial por nombre
            if (search && search.trim() !== '') {
                where.name = {
                    contains: search.trim(),
                    mode: 'insensitive',
                };
            }

            // Obtener productos con sus relaciones
            const products = await prisma.product.findMany({
                where,
                skip: (skip - 1) * take,
                take,
                include: {
                    category: true,
                    variants: true,
                    images: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            // Contar total de productos
            const total = await prisma.product.count({ where });

            // Mapear a entidades
            const mappedProducts = products.map((product: any) => ({
                ...ProductEntity.fromObject(product),
                category: product.category,
                variantCount: product.variants.length,
                imageCount: product.images?.length || 0,
                variants: product.variants.map((v: any) => ProductVariantEntity.fromObject(v)),
                images: (product.images || []).map((i: any) => ProductImageEntity.fromObject(i)),
            }));

            return {
                data: mappedProducts,
                total,
                page: skip,
                limit: take,
                hasMore: (skip * take) < total,
            };
        } catch (error) {
            console.error('Error al listar productos:', error);
            throw CustomError.internal('Error al listar productos');
        }
    }

    /**
     * Obtener detalles de un producto específico
     */
    async getProductById(id: number): Promise<any> {
        try {
            const product = await (prisma.product as any).findUnique({
                where: { id },
                include: {
                    category: true,
                    variants: {
                        include: {
                            color: true,
                            size: true,
                        },
                    },
                    images: true,
                },
            });

            if (!product) {
                throw CustomError.notFound(`El producto con ID ${id} no existe`);
            }

            return {
                ...ProductEntity.fromObject(product),
                category: product.category,
                variantCount: product.variants.length,
                imageCount: (product.images || []).length,
                variants: product.variants.map((v: any) => ({
                    ...ProductVariantEntity.fromObject(v),
                    color: v.color,
                    size: v.size,
                })),
                images: (product.images || []).map((i: any) => ProductImageEntity.fromObject(i)),
            };
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }
            console.error('Error al obtener el producto:', error);
            throw CustomError.internal('Error al obtener el producto');
        }
    }

    /**
     * Eliminar y recrear las imágenes de producto
     */
    private async replaceProductImages(productId: number, imageUrls: string[] = [], imageFiles: Array<{ filename: string; data: string }> = []) {
        const existingImages = await prisma.productImage.findMany({ where: { productId }, select: { url: true } });
        const uploadedUrls = await this.uploadProductFiles(productId, imageFiles);
        const allImageUrls = [...new Set([...(imageUrls || []), ...uploadedUrls])];

        const removedImages = existingImages
            .map((image) => image.url)
            .filter((url) => !allImageUrls.includes(url));

        await Promise.all(removedImages.map((url) => this.deleteCloudinaryUrl(url)));

        await prisma.productImage.deleteMany({ where: { productId } });

        if (allImageUrls.length > 0) {
            await prisma.productImage.createMany({
                data: allImageUrls.map((url: string) => ({
                    url,
                    productId,
                })),
            });
        }
    }

    /**
     * Reemplazar las variantes de un producto
     */
    private async replaceVariants(productId: number, variants: Array<{ colorId: number; sizeId: number; price: number; imageUrl?: string; imageFile?: { filename: string; data: string } }>) {
        const existingVariants = await prisma.productVariant.findMany({
            where: { productId },
            select: { colorId: true, sizeId: true, imageUrl: true },
        });

        const incomingMap = new Map(variants.map((variant) => ([`${variant.colorId}-${variant.sizeId}`, variant])));

        const removedVariantImages = existingVariants
            .filter((existing) => {
                const key = `${existing.colorId}-${existing.sizeId}`;
                const incoming = incomingMap.get(key);
                if (!incoming) {
                    return !!existing.imageUrl;
                }
                return !!existing.imageUrl && incoming.imageFile !== undefined && existing.imageUrl !== incoming.imageUrl;
            })
            .map((existing) => existing.imageUrl)
            .filter((url): url is string => !!url);

        await Promise.all(removedVariantImages.map((url) => this.deleteCloudinaryUrl(url)));

        await prisma.productVariant.deleteMany({ where: { productId } });

        const now = new Date();

        return Promise.all(
            variants.map(async variant => {
                const imageUrl = await this.uploadVariantImage(productId, variant);
                return prisma.productVariant.create({
                    data: {
                        sku: this.generateSKU(productId, variant.colorId, variant.sizeId),
                        price: new Prisma.Decimal(String(variant.price)),
                        colorId: variant.colorId,
                        sizeId: variant.sizeId,
                        imageUrl: imageUrl || null,
                        productId,
                        isActive: true,
                        updatedAt: now,
                    },
                });
            }),
        );
    }

    /**
     * Actualizar un producto
     */
    async updateProduct(
        id: number,
        updateData: UpdateProductDto,
    ): Promise<ProductEntity> {
        try {
            const product = await prisma.product.findUnique({ where: { id } });

            if (!product) {
                throw CustomError.notFound(`El producto con ID ${id} no existe`);
            }

            if (updateData.categoryId) {
                await this.validateCategory(updateData.categoryId);
            }

            if (updateData.colorIds) {
                await this.validateColors(updateData.colorIds);
            }

            if (updateData.sizeIds) {
                await this.validateSizes(updateData.sizeIds);
            }

            if (updateData.imageUrls || updateData.imageFiles) {
                await this.replaceProductImages(id, updateData.imageUrls, updateData.imageFiles);
            }

            if (updateData.variants) {
                await this.replaceVariants(id, updateData.variants);
            }

            const updated = await prisma.product.update({
                where: { id },
                data: {
                    name: updateData.name ?? product.name,
                    description: updateData.description !== undefined ? updateData.description : product.description,
                    categoryId: updateData.categoryId ?? product.categoryId,
                    isActive: updateData.isActive !== undefined ? updateData.isActive : product.isActive,
                    updatedAt: new Date(),
                },
            });

            return ProductEntity.fromObject(updated);
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }
            console.error('Error al actualizar el producto:', error);
            throw CustomError.internal('Error al actualizar el producto');
        }
    }

    /**
     * Eliminar un producto
     */
    async deleteProduct(id: number): Promise<void> {
        try {
            const product = await prisma.product.findUnique({ where: { id } });

            if (!product) {
                throw CustomError.notFound(`El producto con ID ${id} no existe`);
            }

            // Eliminar producto (las imágenes y variantes se eliminarán en cascada)
            await prisma.product.delete({ where: { id } });
        } catch (error) {
            if (error instanceof CustomError) {
                throw error;
            }
            console.error('Error al eliminar el producto:', error);
            throw CustomError.internal('Error al eliminar el producto');
        }
    }
}
