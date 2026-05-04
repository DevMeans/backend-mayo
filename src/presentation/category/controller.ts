import { Response } from "express";
import { CategoryService } from "../services/category.service";
import { CustomError } from "../../domain/errors/custom.error";
import { CategoryDto } from "../../domain/dtos/create-category.dto";

export class CategoryController {
    constructor(
        private readonly categoryService: CategoryService,
    ) { }
    private handleError(error: unknown, res: Response) {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.log(error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
    createCategory = async (req: any, res: Response) => {
        const [error, createCategoryDto] = CategoryDto.create(req.body);

        if (error) {
            return res.status(400).json({ message: error });
        }
        if (createCategoryDto) {
            this.categoryService.createCategory(createCategoryDto).then(category => {
                return res.status(201).json(category);
            }).catch(error => this.handleError(error, res));
        }
    }
}