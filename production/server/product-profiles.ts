import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool, audit, transaction, type DB } from "./db";
import { permission } from "./auth";
import { AppError } from "../shared/domain";
import {
  productProfileSchema,
  type ProductProfile,
} from "../shared/product-profiles";
import type { Actor } from "./service";
export async function listProductProfiles(
  db: DB = pool,
): Promise<ProductProfile[]> {
  const rows = (
    await db.query(
      `SELECT p.id,p.code AS sku,p.name,s.goods_type AS "goodsType",s.image_hash AS hash,s.image_name AS "imageName",COALESCE(s.version,0) AS version,s.updated_at AS "updatedAt" FROM products p LEFT JOIN product_profiles s ON s.product_id=p.id ORDER BY p.code`,
    )
  ).rows;
  return rows.map(({ hash, ...p }) => ({
    ...p,
    imageUrl: hash ? `/api/product-profiles/${p.id}/image?v=${hash}` : null,
  }));
}
function parseImage(data: string) {
  if (data.length % 4 || /[^A-Za-z0-9+/=]/.test(data))
    throw new AppError(400, "Ảnh không đúng định dạng base64");
  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data)
    throw new AppError(400, "Ảnh không đúng định dạng base64");
  if (!bytes.length || bytes.length > 2097152)
    throw new AppError(400, "Ảnh sản phẩm tối đa 2 MB sau khi tối ưu");
  let mime: string;
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    mime = "image/jpeg";
  else if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = "image/png";
  else if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    mime = "image/webp";
  else
    throw new AppError(
      400,
      "Chỉ nhận ảnh JPEG, PNG hoặc WebP; không nhận SVG/HTML",
    );
  return {
    bytes,
    mime,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function saveProductProfile(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = productProfileSchema.parse(raw);
  const product = (
    await db.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!product)
    throw new AppError(
      404,
      "Không tìm thấy mã sản phẩm. Tạo mã tại Dự kiến sản xuất trước",
    );
  const old = (
    await db.query(
      "SELECT goods_type,image_name,image_hash,version FROM product_profiles WHERE product_id=$1",
      [id],
    )
  ).rows[0];
  if ((old?.version || 0) !== input.expectedVersion)
    throw new AppError(
      409,
      "Thiết lập sản phẩm đã được cập nhật. Tải lại trước khi lưu",
    );
  const image = input.image ? parseImage(input.image.data) : null;
  if (!old)
    await db.query(
      "INSERT INTO product_profiles(product_id,goods_type,updated_by) VALUES($1,$2,$3)",
      [id, input.goodsType, actor.id],
    );
  else
    await db.query(
      "UPDATE product_profiles SET goods_type=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE product_id=$1",
      [id, input.goodsType, actor.id],
    );
  if (image)
    await db.query(
      "UPDATE product_profiles SET image=$2,image_mime=$3,image_name=$4,image_hash=$5 WHERE product_id=$1",
      [id, image.bytes, image.mime, input.image!.name, image.hash],
    );
  else if (input.removeImage)
    await db.query(
      "UPDATE product_profiles SET image=NULL,image_mime=NULL,image_name=NULL,image_hash=NULL WHERE product_id=$1",
      [id],
    );
  await audit(db, actor.id, "product-profile.update", id, {
    before: old || null,
    after: {
      goodsType: input.goodsType,
      imageName: image
        ? input.image!.name
        : input.removeImage
          ? null
          : old?.image_name || null,
      imageHash:
        image?.hash || (input.removeImage ? null : old?.image_hash || null),
      version: (old?.version || 0) + 1,
    },
  });
  return (await listProductProfiles(db)).find((p) => p.id === id)!;
}
export const productProfilesRouter = Router();
productProfilesRouter.get("/", async (_req, res) =>
  res.json(await listProductProfiles()),
);
productProfilesRouter.get("/:id/image", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const row = (
    await pool.query(
      "SELECT image,image_mime FROM product_profiles WHERE product_id=$1",
      [id],
    )
  ).rows[0];
  if (!row?.image)
    throw new AppError(404, "Sản phẩm chưa có ảnh hoặc ảnh đã được gỡ");
  res.type(row.image_mime).set("Content-Disposition", "inline").send(row.image);
});
productProfilesRouter.put("/:id", permission("plan"), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(
    await transaction((db) => saveProductProfile(db, req.actor!, id, req.body)),
  );
});
