import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { audit, transaction, pool, type DB } from "./db";
import { permission } from "./auth";
import { receive, loadOrder, type Actor } from "./service";
import { AppError, sizes } from "../shared/domain";
import { incomingFormSchema, normalizeLabel } from "../shared/incoming-goods";
import { incomingOcrStatus, readIncomingImages } from "./incoming-ocr";
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const uploadSchema = z
  .object({
    images: z
      .array(
        z
          .object({
            name: z.string().min(1).max(250),
            data: z.string().min(8).max(11200000),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
const saveSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    form: incomingFormSchema,
  })
  .strict();
const confirmSchema = saveSchema
  .extend({
    checked: z.literal(true),
    orders: z
      .array(
        z
          .object({ id: z.uuid(), version: z.number().int().positive() })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new AppError(
    400,
    "Chỉ nhận ảnh JPEG, PNG hoặc WebP. HEIC/PDF cần chuyển thành ảnh trước.",
  );
}
export async function incomingDraft(
  db: DB,
  actor: Actor,
  id: string,
  lock = false,
) {
  const row = (
    await db.query(
      "SELECT * FROM incoming_goods_drafts WHERE id=$1" +
        (lock ? " FOR UPDATE" : ""),
      [id],
    )
  ).rows[0];
  if (!row || (row.actor_id !== actor.id && actor.role !== "Administrator"))
    throw new AppError(404, "Không tìm thấy phiếu được phép truy cập");
  return row;
}
function editable(d: any, version: number) {
  if (d.state !== "draft")
    throw new AppError(409, "Phiếu đã được xác nhận; không sửa biên nhận cũ");
  if (d.version !== version)
    throw new AppError(
      409,
      "Phiếu đã thay đổi. Mở lại phiếu trước khi tiếp tục",
    );
}
export async function createIncoming(db: DB, actor: Actor, raw: unknown) {
  const { images } = uploadSchema.parse(raw);
  let total = 0;
  const parsed = images.map((i) => {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        i.data,
      )
    )
      throw new AppError(400, "Ảnh mã hóa không hợp lệ");
    const bytes = Buffer.from(i.data, "base64");
    total += bytes.length;
    return {
      id: randomUUID(),
      name: i.name,
      bytes,
      mime: imageType(bytes),
      sha: hash(bytes),
    };
  });
  if (total > 8 * 1024 * 1024)
    throw new AppError(400, "Tổng ảnh của một phiếu tối đa 8 MB");
  if (new Set(parsed.map((i) => i.sha)).size !== parsed.length)
    throw new AppError(400, "Ảnh bị trùng trong cùng phiếu");
  // Serialize identical image uploads/confirmation to prevent duplicate source receipts.
  for (const sha of parsed.map((i) => i.sha).sort())
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "incoming-image:" + sha,
    ]);
  for (const image of parsed) {
    const duplicate = (
      await db.query(
        `SELECT d.id FROM incoming_goods_images i JOIN incoming_goods_drafts d ON d.id=i.draft_id WHERE i.sha256=$1 AND d.state='confirmed' LIMIT 1`,
        [image.sha],
      )
    ).rows[0];
    if (duplicate)
      throw new AppError(
        409,
        "Ảnh này đã được ghi nhận trong phiếu trước. Kiểm tra lịch sử, không nhập lại",
      );
  }
  const id = randomUUID();
  const form = {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
    note: "",
    rows: [],
  };
  await db.query(
    "INSERT INTO incoming_goods_drafts(id,actor_id,form) VALUES($1,$2,$3)",
    [id, actor.id, JSON.stringify(form)],
  );
  for (const i of parsed)
    await db.query(
      "INSERT INTO incoming_goods_images(id,draft_id,name,mime,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)",
      [i.id, id, i.name, i.mime, i.sha, i.bytes],
    );
  await audit(db, actor.id, "incoming.create", id, {
    images: parsed.map((i) => ({ id: i.id, sha: i.sha, name: i.name })),
  });
  return { id };
}
export async function saveIncoming(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = saveSchema.parse(raw);
  const d = await incomingDraft(db, actor, id, true);
  editable(d, input.expectedVersion);
  await db.query(
    "UPDATE incoming_goods_drafts SET form=$2,version=version+1,updated_at=now() WHERE id=$1",
    [id, JSON.stringify(input.form)],
  );
  return { version: d.version + 1 };
}
export async function confirmIncoming(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = confirmSchema.parse(raw);
  const user = (
    await db.query("SELECT role,disabled FROM users WHERE id=$1", [actor.id])
  ).rows[0];
  if (
    !user ||
    user.disabled ||
    !["Administrator", "Warehouse Operator"].includes(user.role)
  )
    throw new AppError(403, "Cần quyền ghi nhận hàng đang hoạt động");
  const d = await incomingDraft(db, actor, id, true),
    requestHash = hash(JSON.stringify(input));
  if (d.state === "confirmed") {
    if (d.confirmation_hash !== requestHash)
      throw new AppError(409, "Phiếu đã ghi nhận với nội dung khác");
    return d.result;
  }
  editable(d, input.expectedVersion);
  const imageHashes = (
    await db.query(
      "SELECT sha256 FROM incoming_goods_images WHERE draft_id=$1 ORDER BY sha256",
      [id],
    )
  ).rows;
  for (const image of imageHashes) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "incoming-image:" + image.sha256,
    ]);
    if (
      (
        await db.query(
          "SELECT 1 FROM incoming_goods_images i JOIN incoming_goods_drafts d ON d.id=i.draft_id WHERE i.sha256=$1 AND d.state='confirmed' AND d.id<>$2",
          [image.sha256, id],
        )
      ).rowCount
    )
      throw new AppError(
        409,
        "Ảnh đã được ghi nhận ở phiếu khác; không ghi trùng",
      );
  }
  if (new Set(input.form.rows.map((r) => r.id)).size !== input.form.rows.length)
    throw new AppError(400, "Trùng dòng nhập liệu");
  if (input.form.rows.some((r) => r.qty === null))
    throw new AppError(
      400,
      "Còn ô số lượng chưa kiểm tra; nhập 0 nếu thực tế không có hàng",
    );
  const positive = input.form.rows.filter((r) => r.qty! > 0);
  if (!positive.length)
    throw new AppError(400, "Phải có ít nhất một dòng nhận hàng");
  const orderIds = [...new Set(positive.map((r) => r.orderId))].sort();
  if (orderIds.includes(null))
    throw new AppError(400, "Chọn lệnh cho tất cả dòng có hàng");
  if (
    new Set(input.orders.map((o) => o.id)).size !== input.orders.length ||
    input.orders.length !== orderIds.length ||
    input.orders.some((o) => !orderIds.includes(o.id))
  )
    throw new AppError(
      400,
      "Danh sách phiên bản lệnh không khớp các dòng nhận",
    );
  const results = [];
  const aliasChanges = new Map<
    string,
    { productId: string; raw: string; color: string }
  >();
  for (const orderId of orderIds as string[]) {
    const order = await loadOrder(db, orderId, true);
    const rows = positive.filter((r) => r.orderId === orderId);
    const lineQty = new Map<string, number>();
    for (const row of rows) {
      const item = order.items.find((i) => i.variantId === row.variantId);
      if (
        !item ||
        !sizes.includes(item.size as (typeof sizes)[number]) ||
        item.size !== row.size ||
        normalizeLabel(item.sku) !== normalizeLabel(row.sku)
      )
        throw new AppError(
          409,
          "Mã–màu–size đã chọn không khớp dòng của lệnh hoặc size đã ngừng",
        );
      lineQty.set(item.id, (lineQty.get(item.id) || 0) + row.qty!);
      if (row.remember) {
        if (
          ["", "chua ro", "unknown", "khong ro"].includes(
            normalizeLabel(row.color),
          )
        )
          throw new AppError(
            400,
            "Không ghi nhớ màu chưa đọc rõ. Sửa cách viết màu trên phiếu hoặc bỏ Ghi nhớ",
          );
        const product = (
          await db.query("SELECT product_id FROM variants WHERE id=$1", [
            item.variantId,
          ])
        ).rows[0];
        const alias = {
          productId: product.product_id,
          raw: normalizeLabel(row.color),
          color: item.color,
        };
        const key = alias.productId + ":" + alias.raw;
        if (
          aliasChanges.has(key) &&
          aliasChanges.get(key)!.color !== alias.color
        )
          throw new AppError(
            400,
            "Cùng mã và cách viết màu đang ánh xạ sang hai màu khác nhau",
          );
        aliasChanges.set(key, alias);
      }
    }
    const receipt = await receive(db, actor, orderId, "incoming-" + id, {
      expectedVersion: input.orders.find((o) => o.id === orderId)!.version,
      date: input.form.date,
      note: (`Phiếu nhập ${id}. ` + input.form.note).slice(0, 1000),
      lines: [...lineQty].map(([itemId, qty]) => ({ itemId, qty })),
    });
    results.push({ ...receipt, code: order.code });
  }
  for (const [key, a] of [...aliasChanges].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "incoming-alias:" + key,
    ]);
    const old = (
      await db.query(
        "SELECT color FROM incoming_color_aliases WHERE product_id=$1 AND raw_color=$2",
        [a.productId, a.raw],
      )
    ).rows[0];
    // Never silently replace an existing rule; resolve conflicting mappings explicitly.
    if (old && old.color !== a.color)
      throw new AppError(
        409,
        "Quy ước màu đã lưu khác lựa chọn này. Bỏ Ghi nhớ để nhập riêng phiếu này",
      );
    await db.query(
      "INSERT INTO incoming_color_aliases(product_id,raw_color,color,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,raw_color) DO NOTHING",
      [a.productId, a.raw, a.color, actor.id],
    );
  }
  const result = {
    draftId: id,
    receipts: results,
    received: positive.reduce((n, r) => n + r.qty!, 0),
  };
  await db.query(
    "UPDATE incoming_goods_drafts SET form=$2,state='confirmed',confirmation_hash=$3,result=$4,version=version+1,updated_at=now() WHERE id=$1",
    [id, JSON.stringify(input.form), requestHash, JSON.stringify(result)],
  );
  await audit(db, actor.id, "incoming.confirm", id, {
    form: input.form,
    result,
    aliases: [...aliasChanges.values()],
  });
  return result;
}
export const incomingRouter = Router();
incomingRouter.use(permission("receive"));
incomingRouter.get("/status", (_req, res) => res.json(incomingOcrStatus()));
incomingRouter.get("/aliases", async (_req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT p.code AS sku,a.raw_color,a.color FROM incoming_color_aliases a JOIN products p ON p.id=a.product_id ORDER BY p.code,a.raw_color",
      )
    ).rows,
  ),
);
incomingRouter.get("/", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT id,state,version,created_at,updated_at,result,jsonb_array_length(form->'rows') AS rows FROM incoming_goods_drafts WHERE actor_id=$1 ORDER BY updated_at DESC LIMIT 100",
        [req.actor!.id],
      )
    ).rows,
  ),
);
incomingRouter.post(
  "/",
  rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) =>
    res
      .status(201)
      .json(
        await transaction((db) => createIncoming(db, req.actor!, req.body)),
      ),
);
incomingRouter.get("/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    d = await incomingDraft(pool, req.actor!, id);
  const images = (
    await pool.query(
      "SELECT id,name,mime,sha256 FROM incoming_goods_images WHERE draft_id=$1 ORDER BY name,id",
      [id],
    )
  ).rows;
  res.json({ ...d, images });
});
incomingRouter.get("/:id/images/:imageId", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await incomingDraft(pool, req.actor!, id);
  const image = (
    await pool.query(
      "SELECT mime,bytes FROM incoming_goods_images WHERE draft_id=$1 AND id=$2",
      [id, z.uuid().parse(req.params.imageId)],
    )
  ).rows[0];
  if (!image) throw new AppError(404, "Không tìm thấy ảnh");
  res
    .set("Content-Type", image.mime)
    .set("X-Content-Type-Options", "nosniff")
    .send(image.bytes);
});
incomingRouter.put("/:id", async (req, res) =>
  res.json(
    await transaction((db) =>
      saveIncoming(db, req.actor!, z.uuid().parse(req.params.id), req.body),
    ),
  ),
);
incomingRouter.post(
  "/:id/read",
  rateLimit({
    windowMs: 60000,
    limit: 4,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      input = z
        .object({
          expectedVersion: z.number().int().positive(),
          consent: z.literal(true),
        })
        .strict()
        .parse(req.body);
    const d = await incomingDraft(pool, req.actor!, id);
    editable(d, input.expectedVersion);
    if (d.form.rows.length)
      throw new AppError(
        409,
        "Phiếu đã có bảng nhập liệu. Tạo phiếu mới để đọc ảnh khác, tránh ghi đè dữ liệu đang sửa",
      );
    const images = (
      await pool.query(
        "SELECT mime,bytes FROM incoming_goods_images WHERE draft_id=$1 ORDER BY name,id",
        [id],
      )
    ).rows;
    if (!images.length) throw new AppError(400, "Phiếu không có ảnh");
    await transaction(async (db) => {
      const current = await incomingDraft(db, req.actor!, id, true);
      editable(current, input.expectedVersion);
      await audit(db, req.actor!.id, "incoming.ocr.request", id, {
        provider: "OpenAI",
        model: incomingOcrStatus().model,
        consent: true,
        imageCount: images.length,
      });
    });
    const result = await readIncomingImages(images);
    const form = {
      date: result.date || d.form.date,
      note: result.note,
      rows: result.rows.flatMap((row) =>
        sizes.map((size) => ({
          id: randomUUID(),
          sku: row.sku || "CHƯA RÕ",
          color: row.color || "CHƯA RÕ",
          bag: row.bag,
          size,
          qty: row[size],
          variantId: null,
          orderId: null,
          remember: false,
        })),
      ),
    };
    await transaction(async (db) => {
      const current = await incomingDraft(db, req.actor!, id, true);
      editable(current, input.expectedVersion);
      await db.query(
        "UPDATE incoming_goods_drafts SET form=$2,ocr=$3,version=version+1,updated_at=now() WHERE id=$1",
        [id, JSON.stringify(form), JSON.stringify(result)],
      );
      await audit(db, req.actor!.id, "incoming.ocr", id, {
        provider: "OpenAI",
        model: incomingOcrStatus().model,
        consent: true,
        imageCount: images.length,
      });
    });
    res.json({ version: d.version + 1, form, ocr: result });
  },
);
incomingRouter.post("/:id/confirm", async (req, res) =>
  res.json(
    await transaction((db) =>
      confirmIncoming(db, req.actor!, z.uuid().parse(req.params.id), req.body),
    ),
  ),
);
