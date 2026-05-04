import { CategoryDto } from "../../domain/dtos/create-category.dto";

import { prisma } from "../../data/prisma";
import { CustomError } from '../../domain/errors/custom.error';
import { CategoryEntity } from "../../domain/entities/category.entity";
export class CategoryService {

    constructor() { }
    async createCategory(createCategoryDto: CategoryDto): Promise<CategoryEntity> {
        const category = await prisma.category.findFirst({
            where: {
                name: createCategoryDto.name,
            },
        });
        if (category) {
            throw CustomError.badRequest('Ya existe una categoría con ese nombre');
        }
        try {
            const newCategory = await prisma.category.create({
                data: {
                    name: createCategoryDto.name,
                    isActive: createCategoryDto.isActive,
                },
            });
            return CategoryEntity.fromObject(newCategory);
        } catch (error) {
            throw CustomError.internal('Error al crear la categoría');
        }
    }
}
