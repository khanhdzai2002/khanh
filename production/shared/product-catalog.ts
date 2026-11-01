import { z } from "zod";
import { sizes, goodsTypes } from "./domain";
const fields = {
  colors: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  sizes: z.array(z.enum(sizes)).min(1).max(4),
};
export const productCatalogSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("new"),
      sku: z.string().trim().min(1).max(90),
      name: z.string().trim().max(300).default(""),
      goodsType: z.enum(goodsTypes).nullable().default(null),
      ...fields,
    })
    .strict(),
  z
    .object({ mode: z.literal("append"), productId: z.uuid(), ...fields })
    .strict(),
]);
export type ProductCatalogResult = {
  productId: string;
  sku: string;
  created: number;
  skipped: number;
  ids: string[];
};
