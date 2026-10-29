import { z } from "zod";
import { goodsTypes, type GoodsType } from "./domain";
export type ProductColorProfile = {
  key: string;
  color: string;
  imageUrl: string | null;
  imageName: string | null;
  version: number;
  updatedAt: string | null;
};
export type ProductProfile = {
  id: string;
  sku: string;
  name: string;
  goodsType: GoodsType | null;
  imageUrl: string | null;
  imageName: string | null;
  version: number;
  updatedAt: string | null;
  colors?: ProductColorProfile[];
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
export const productColorKey = (color: string) => color.trim().toLowerCase();
export const productColorPhotoSchema = z
  .object({
    expectedVersion: productProfileSchema.shape.expectedVersion,
    image: productProfileSchema.shape.image,
    removeImage: productProfileSchema.shape.removeImage,
    color: z.string().trim().min(1).max(200),
  })
  .strict()
  .refine((v) => !v.image || !v.removeImage, {
    message: "Chọn thay ảnh hoặc gỡ ảnh, không chọn cả hai",
  });
export function productPhotoFor(
  products: ProductProfile[],
  sku: string,
  color?: string,
) {
  const product = productFor(products, sku);
  const variant = color
    ? product?.colors?.find((c) => c.key === productColorKey(color))
    : undefined;
  return {
    url: variant?.imageUrl || product?.imageUrl || null,
    source: variant?.imageUrl ? "color" : "common",
  };
}
