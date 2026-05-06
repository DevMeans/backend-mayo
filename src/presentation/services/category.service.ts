import { CategoryDto } from "../../domain/dtos/create-category.dto";

import { prisma } from "../../data/prisma";
import { CustomError } from '../../domain/errors/custom.error';
import { CategoryEntity } from "../../domain/entities/category.entity";
import { ListCategoryDto } from '../../domain/dtos/list-category.dto';
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
    async listCategory(listCategoryDto: ListCategoryDto) {
        const { skip: skip = 1, take: take = 10 } = listCategoryDto;
        try {
            const categories = await prisma.category.findMany({
                skip: (skip - 1) * take,
                take: take,
            });
            const total = await prisma.category.count();

            return {
                data: categories.map(category => CategoryEntity.fromObject(category)),
                total,
                page: skip,
                limit: take,
                //seco:categories duplicado crudo
            }
        } catch (error) {
            throw CustomError.internal('Error al listar las categorías');
        }
    }
    findcategoriesbyname(name: string, isActive?: boolean): Promise<CategoryEntity[] | null> {
        return prisma.category.findMany({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive',
                },
                ...(isActive !== undefined && { isActive }),
            },
        }).then(categories => categories.length > 0 ? categories.map(CategoryEntity.fromObject) : null);
    }
}
