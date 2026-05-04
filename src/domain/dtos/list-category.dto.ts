export class ListCategoryDto {
    private constructor(
        public readonly page: number,
        public readonly limit: number,
    ) { }
    static create(page: number = 1, limit: number = 10): [string | undefined, ListCategoryDto | undefined] {
        if (isNaN(page) || page < 1) {
            return ['El número de página debe ser un número entero mayor a 0', undefined];
        }
        if (isNaN(limit) || limit < 1) {
            return ['El número de elementos por página debe ser un número entero mayor a 0', undefined];
        }
        return [undefined, new ListCategoryDto(page, limit)];

    }
}