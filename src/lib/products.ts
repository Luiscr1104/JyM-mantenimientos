export const PRODUCTS = [
    { key: 'granulated_chlorine', label: 'Cloro granulado', unit: 'g' },
    { key: 'chlorine_tablet', label: 'Pastilla de cloro', unit: 'unidades' },
    { key: 'caustic_base', label: 'Base cáustica', unit: 'g' },
] as const;

export type ProductKey = (typeof PRODUCTS)[number]['key'];

export function productInfo(key: ProductKey) {
    return PRODUCTS.find((item) => item.key === key)!;
}
