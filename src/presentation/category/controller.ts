import { Request, Response } from "express";
import { CategoryService } from "../services/category.service";
import { CustomError } from "../../domain/errors/custom.error";
import { CategoryDto } from "../../domain/dtos/create-category.dto";
import { ListCategoryDto } from "../../domain/dtos/list-category.dto";

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
    listCategory = async (req: any, res: Response) => {
        const { skip, take } = req.query;
        const [error, listCategoryDto] = ListCategoryDto.create(Number(skip), Number(take));
        if (error) {
            return res.status(400).json({ message: error });
        }
        if (listCategoryDto) {
            this.categoryService.listCategory(listCategoryDto).then(categories => {
                return res.status(200).json(categories);
            }).catch(error => this.handleError(error, res));
        }
    }
    findcategoriesbyname = async (req: Request, res: Response) => {
        const { name } = req.query;
        const [error, findCategoryDto] = CategoryDto.create({ name });
        if (error) {
            return res.status(400).json({ message: error });
        }
        if (findCategoryDto) {
            this.categoryService.findcategoriesbyname(findCategoryDto.name).then(categories => {
                if (categories) {
                    return res.status(200).json(categories);
                } else {
                    return res.status(404).json({ message: 'No se encontraron categorías con ese nombre' });
                }
            }).catch(error => this.handleError(error, res));
        }
    }
}