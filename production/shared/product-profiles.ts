import { z } from "zod";
import { goodsTypes, type GoodsType } from "./domain";
export type ProductProfile = {
  id: string;
  sku: string;
  name: string;
  goodsType: GoodsType | null;
  imageUrl: string | null;
  imageName: string | null;
  version: number;
  updatedAt: string | null;
};
export const productProfileSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    goodsType: z.enum(goodsTypes).nullable(),
    image: z
      .object({
        name: z.string().trim().min(1).max(250),
        data: z.string().min(8).max(2800000),
      })
      .strict()
      .optional(),
    removeImage: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.image || !v.removeImage, {
    message: "Chọn thay ảnh hoặc gỡ ảnh, không chọn cả hai",
  });
export const productFor = (products: ProductProfile[], sku: string) =>
  products.find((p) => p.sku.trim().toUpperCase() === sku.trim().toUpperCase());
