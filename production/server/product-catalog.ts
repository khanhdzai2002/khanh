import { randomUUID } from "node:crypto";
import { audit, type DB } from "./db";
import { saveSku, type Actor } from "./service";
import { AppError, sizes } from "../shared/domain";
import {
  productCatalogSchema,
  type ProductCatalogResult,
} from "../shared/product-catalog";
import { productColorKey } from "../shared/product-profiles";
export async function addProductCatalog(
  db: DB,
  actor: Actor,
  raw: unknown,
): Promise<ProductCatalogResult> {
  const input = productCatalogSchema.parse(raw);
  const chosenSizes = sizes.filter((s) => input.sizes.includes(s));
  const colors = [
    ...new Map(input.colors.map((c) => [productColorKey(c), c])).values(),
  ];
  let product: { id: string; code: string; name: string };
  if (input.mode === "new") {
    const code = input.sku.toUpperCase();
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "product-catalog:" + code,
    ]);
    if (
      (await db.query("SELECT id FROM products WHERE code=$1", [code])).rowCount
    )
      throw new AppError(
        409,
        "Mã sản phẩm đã có. Dùng Thêm SKU con trên mã đó để bổ sung màu/size",
      );
    product = { id: randomUUID(), code, name: input.name };
    await db.query("INSERT INTO products(id,code,name) VALUES($1,$2,$3)", [
      product.id,
      code,
      input.name,
    ]);
    if (input.goodsType)
      await db.query(
        "INSERT INTO product_profiles(product_id,goods_type,updated_by) VALUES($1,$2,$3)",
        [product.id, input.goodsType, actor.id],
      );
  } else {
    product = (
      await db.query(
        "SELECT id,code,name FROM products WHERE id=$1 FOR UPDATE",
        [input.productId],
      )
    ).rows[0];
    if (!product)
      throw new AppError(404, "Không tìm thấy sản phẩm để thêm SKU");
  }
  const existing = (
    await db.query(
      "SELECT id,color_key,size,body->>'color' AS color FROM variants WHERE product_id=$1 FOR UPDATE",
      [product.id],
    )
  ).rows;
  const photos = (
    await db.query(
      "SELECT color_key,color_label AS color FROM product_color_profiles WHERE product_id=$1",
      [product.id],
    )
  ).rows;
  const ids: string[] = [];
  let skipped = 0;
  for (const rawColor of colors) {
    const key = productColorKey(rawColor),
      color =
        existing.find((v) => v.color_key === key)?.color ||
        photos.find((p) => p.color_key === key)?.color ||
        rawColor;
    for (const size of chosenSizes) {
      if (existing.some((v) => v.color_key === key && v.size === size)) {
        skipped++;
        continue;
      }
      try {
        ids.push(
          await saveSku(db, actor, {
            sku: product.code,
            name: product.name,
            color,
            size,
          }),
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new AppError(
            409,
            "SKU vừa được thêm bởi thao tác khác. Tải lại và thử lại; dữ liệu cũ được giữ nguyên",
          );
        throw error;
      }
    }
  }
  await audit(
    db,
    actor.id,
    input.mode === "new" ? "product-catalog.create" : "product-catalog.append",
    product.id,
    {
      sku: product.code,
      colors,
      sizes: chosenSizes,
      created: ids.length,
      skipped,
      ids,
    },
  );
  return {
    productId: product.id,
    sku: product.code,
    created: ids.length,
    skipped,
    ids,
  };
}
