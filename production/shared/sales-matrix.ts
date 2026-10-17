import { sizes } from "./domain";
export type MatrixVariant = {
  sku: string;
  color: string;
  size: string;
  qty: number;
  name?: string;
  r2?: number;
  r7?: number;
};
export type SalesColor = {
  color: string;
  qty: number;
  sizeTotals: Record<string, number>;
  variants: MatrixVariant[];
};
export type SalesProduct = {
  sku: string;
  name: string;
  qty: number;
  r2: number;
  r7: number;
  sizeTotals: Record<string, number>;
  colors: SalesColor[];
  variants: MatrixVariant[];
};
const emptySizes = () => Object.fromEntries(sizes.map((size) => [size, 0]));
export function salesMatrix(rows: MatrixVariant[]): SalesProduct[] {
  const products = new Map<string, SalesProduct>();
  for (const row of rows) {
    if (
      !sizes.includes(row.size as any) ||
      !Number.isFinite(row.qty) ||
      row.qty <= 0
    )
      continue;
    const key = row.sku.trim().toUpperCase();
    let product = products.get(key);
    if (!product) {
      product = {
        sku: key,
        name: row.name || "",
        qty: 0,
        r2: 0,
        r7: 0,
        sizeTotals: emptySizes(),
        colors: [],
        variants: [],
      };
      products.set(key, product);
    }
    let color = product.colors.find(
      (c) => c.color.toLowerCase() === row.color.trim().toLowerCase(),
    );
    if (!color) {
      color = {
        color: row.color.trim(),
        qty: 0,
        sizeTotals: emptySizes(),
        variants: [],
      };
      product.colors.push(color);
    }
    product.qty += row.qty;
    product.r2 += row.r2 || 0;
    product.r7 += row.r7 || 0;
    product.sizeTotals[row.size] += row.qty;
    color.qty += row.qty;
    color.sizeTotals[row.size] += row.qty;
    product.variants.push(row);
    color.variants.push(row);
  }
  for (const p of products.values())
    p.colors.sort(
      (a, b) => b.qty - a.qty || a.color.localeCompare(b.color, "vi"),
    );
  return [...products.values()].sort(
    (a, b) => b.qty - a.qty || a.sku.localeCompare(b.sku, "vi"),
  );
}
