import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction, audit, type DB } from "./db";
import {
  AppError,
  isActiveSize,
  sizes,
  skuSchema,
  orderSchema,
  totals,
  type Sku,
  type OrderInput,
  type ProductionOrder,
  type Variant,
  policySchema,
  forecast,
} from "../shared/domain";
export type Actor = { id: string; name: string; role: string };
export async function loadOrder(
  db: DB,
  id: string,
  lock = false,
): Promise<ProductionOrder> {
  const res = await db.query(
    "SELECT * FROM production_orders WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
    [id],
  );
  const o = res.rows[0];
  if (!o) throw new AppError(404, "Không tìm thấy lệnh");
  const items = await db.query(
    "SELECT i.*,v.body FROM production_order_items i JOIN variants v ON v.id=i.variant_id WHERE order_id=$1 ORDER BY i.id",
    [id],
  );
  return {
    ...o.body,
    id: o.id,
    code: o.code,
    version: o.version,
    items: items.rows.map((i) => ({
      id: i.id,
      variantId: i.variant_id,
      sku: i.body.sku,
      color: i.body.color,
      size: i.body.size,
      qty: i.qty,
      received: i.received,
      priority: i.priority,
    })),
  };
}
export async function listOrders(db: DB = pool) {
  const result = await db.query(
    "SELECT id FROM production_orders ORDER BY created_at DESC",
  );
  return Promise.all(result.rows.map((r) => loadOrder(db, r.id)));
}
export async function variants(db: DB = pool): Promise<Variant[]> {
  const r = await db.query(
    "SELECT id,body,version FROM variants WHERE size=ANY($1::text[]) ORDER BY body->>'sku',body->>'color',size",
    [sizes],
  );
  return r.rows.map((x) => ({ ...x.body, id: x.id, version: x.version }));
}
export async function saveSku(
  db: DB,
  actor: Actor,
  raw: unknown,
  id?: string,
  version?: number,
) {
  const body = skuSchema.parse(raw);
  body.sku = body.sku.toUpperCase();
  if (id) {
    const old = (
      await db.query("SELECT * FROM variants WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!old) throw new AppError(404, "Không tìm thấy SKU");
    if (!isActiveSize(old.size))
      throw new AppError(
        409,
        "SKU đã ngừng kinh doanh; không sửa hoặc đổi định danh lịch sử",
      );
    if (old.version !== version)
      throw new AppError(409, "SKU đã thay đổi. Hãy tải lại.");
    if (
      old.body.sku !== body.sku ||
      old.body.color !== body.color ||
      old.body.size !== body.size
    ) {
      const used = await db.query(
        "SELECT 1 FROM production_order_items WHERE variant_id=$1 LIMIT 1",
        [id],
      );
      if (used.rowCount)
        throw new AppError(
          409,
          "SKU đã được dùng trong lệnh; hãy tạo SKU mới thay vì đổi định danh",
        );
    }
  }
  let product = (
    await db.query("SELECT id FROM products WHERE code=$1", [body.sku])
  ).rows[0];
  if (!product) {
    const pid = randomUUID();
    await db.query(
      "INSERT INTO products VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING",
      [pid, body.sku, body.name],
    );
    product = (
      await db.query("SELECT id FROM products WHERE code=$1", [body.sku])
    ).rows[0];
  }
  const key = id || randomUUID();
  body.inventoryAt = body.inventoryAt || new Date().toISOString();
  if (id)
    await db.query(
      "UPDATE variants SET product_id=$2,color_key=$3,size=$4,body=$5,version=version+1 WHERE id=$1",
      [
        key,
        product.id,
        body.color.toLowerCase(),
        body.size,
        JSON.stringify(body),
      ],
    );
  else
    await db.query(
      "INSERT INTO variants(id,product_id,color_key,size,body) VALUES($1,$2,$3,$4,$5)",
      [
        key,
        product.id,
        body.color.toLowerCase(),
        body.size,
        JSON.stringify(body),
      ],
    );
  await db.query(
    "INSERT INTO inventory_snapshots VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      key,
      body.stock,
      body.inbound,
      body.inventorySource,
      body.inventoryAt,
      actor.id,
    ],
  );
  await audit(db, actor.id, id ? "sku.update" : "sku.create", key, body);
  return key;
}
const checkVersion = (o: ProductionOrder, version: number) => {
  if (o.version !== version)
    throw new AppError(
      409,
      "Lệnh đã được người khác cập nhật. Hãy tải lại trước khi sửa.",
    );
};
const active = (o: ProductionOrder) => {
  if (o.deletedAt)
    throw new AppError(409, "Lệnh đã xóa; hãy khôi phục trước khi thao tác.");
};
async function reserveCode(db: DB, code: string, id: string) {
  const old = (
    await db.query(
      "SELECT order_id FROM order_code_reservations WHERE code=$1",
      [code.toLowerCase()],
    )
  ).rows[0];
  if (old && old.order_id !== id)
    throw new AppError(
      409,
      "Mã lệnh đã được sử dụng, kể cả trong lịch sử đã xóa.",
    );
  if (!old)
    await db.query("INSERT INTO order_code_reservations VALUES($1,$2)", [
      code.toLowerCase(),
      id,
    ]);
}
async function nextCode(db: DB) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('comsflow:order-code'))",
  );
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const prefix = "LSX-" + date + "-";
  const result = await db.query(
    "SELECT code FROM order_code_reservations WHERE code LIKE $1",
    [prefix.toLowerCase() + "%"],
  );
  const max = Math.max(
    0,
    ...result.rows.map((r) =>
      /^\d+$/.test(r.code.slice(prefix.length))
        ? Number(r.code.slice(prefix.length))
        : 0,
    ),
  );
  return prefix + String(max + 1).padStart(2, "0");
}
async function setSupplier(db: DB, name: string) {
  await db.query(
    "INSERT INTO suppliers VALUES($1,$2) ON CONFLICT(name) DO NOTHING",
    [randomUUID(), name],
  );
  return (await db.query("SELECT id FROM suppliers WHERE name=$1", [name]))
    .rows[0].id;
}
function validateItems(input: OrderInput) {
  if (new Set(input.items.map((i) => i.variantId)).size !== input.items.length)
    throw new AppError(400, "Không được trùng mã–màu–size trong cùng lệnh.");
  const ids = input.items.flatMap((i) => (i.id ? [i.id] : []));
  if (new Set(ids).size !== ids.length)
    throw new AppError(400, "Trùng định danh dòng hàng");
}
export async function createOrder(db: DB, actor: Actor, raw: unknown) {
  const input = orderSchema.parse(raw);
  validateItems(input);
  if (input.items.some((i) => i.id))
    throw new AppError(400, "Dòng mới không được có ID cũ");
  const selectedVariants = (
    await db.query("SELECT id,size FROM variants WHERE id=ANY($1::uuid[])", [
      input.items.map((i) => i.variantId),
    ])
  ).rows;
  if (
    selectedVariants.length !== input.items.length ||
    selectedVariants.some((v) => !isActiveSize(v.size))
  )
    throw new AppError(400, "Lệnh mới chỉ được dùng size S, M, L, XL");
  const id = randomUUID(),
    code = input.code || (await nextCode(db)),
    now = new Date().toISOString();
  const { items, ...fields } = input;
  const body = {
    ...fields,
    cancelled: false,
    deletedAt: null,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  await db.query(
    "INSERT INTO production_orders(id,code,supplier_id,body) VALUES($1,$2,$3,$4)",
    [id, code, await setSupplier(db, input.supplier), JSON.stringify(body)],
  );
  await reserveCode(db, code, id);
  for (const item of items)
    await db.query(
      "INSERT INTO production_order_items(id,order_id,variant_id,qty,priority) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, item.variantId, item.qty, item.priority],
    );
  const order = await loadOrder(db, id);
  await audit(db, actor.id, "order.create", id, order);
  return order;
}
export async function editOrder(
  db: DB,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const parsed = z
    .object({
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(450),
      reopen: z.boolean().default(false),
      order: orderSchema,
    })
    .strict()
    .parse(raw);
  const before = await loadOrder(db, id, true);
  active(before);
  checkVersion(before, parsed.expectedVersion);
  const next = parsed.order;
  validateItems(next);
  const original = new Map(before.items.map((i) => [i.id, i]));
  const retired = before.items.filter((i) => !isActiveSize(i.size));
  for (const old of retired) {
    const nextItem = next.items.find((i) => i.id === old.id);
    if (
      !nextItem ||
      nextItem.variantId !== old.variantId ||
      nextItem.qty !== old.qty
    )
      throw new AppError(
        409,
        "Dòng size đã ngừng chỉ giữ nguyên để bảo toàn lịch sử",
      );
  }
  const targetVariants = (
    await db.query("SELECT id,size FROM variants WHERE id=ANY($1::uuid[])", [
      next.items.map((i) => i.variantId),
    ])
  ).rows;
  for (const item of next.items) {
    const v = targetVariants.find((v) => v.id === item.variantId);
    if (
      !v ||
      (!isActiveSize(v.size) &&
        !retired.some(
          (r) => r.id === item.id && r.variantId === item.variantId,
        ))
    )
      throw new AppError(400, "Không thêm dòng size đã ngừng vào lệnh");
  }

  for (const item of next.items) {
    const old = item.id ? original.get(item.id) : undefined;
    if (item.id && !old) throw new AppError(400, "Dòng không thuộc lệnh này");
    if (
      old &&
      old.received > 0 &&
      (item.variantId !== old.variantId ||
        item.qty < Math.min(old.qty, old.received))
    )
      throw new AppError(
        409,
        "Dòng đã nhận bị khóa SKU; không giảm số đặt dưới mức đã nhận hoặc mức đặt gốc nếu đã giao dư.",
      );
  }
  for (const old of before.items)
    if (old.received > 0 && !next.items.some((i) => i.id === old.id))
      throw new AppError(409, "Không thể xóa dòng đã nhận hàng.");
  const sameItems = (a: typeof next.items, b: typeof next.items) =>
    JSON.stringify(
      [...a].sort((x, y) => x.variantId.localeCompare(y.variantId)),
    ) ===
    JSON.stringify(
      [...b].sort((x, y) => x.variantId.localeCompare(y.variantId)),
    );
  const oldInput = before.items.map((i) => ({
    id: i.id,
    variantId: i.variantId,
    qty: i.qty,
    priority: i.priority,
  }));
  if (
    before.cancelled &&
    !parsed.reopen &&
    !sameItems(next.items, oldInput as typeof next.items)
  )
    throw new AppError(
      409,
      "Hãy khôi phục phần chưa nhận trước khi sửa các dòng hàng.",
    );
  const code = next.code || before.code;
  await reserveCode(db, code, id);
  // Unreceived rows have no receipt references. Received row identities are never deleted.
  await db.query(
    "DELETE FROM production_order_items WHERE order_id=$1 AND received=0 AND variant_id IN (SELECT id FROM variants WHERE size=ANY($2::text[]))",
    [id, sizes],
  );
  for (const i of next.items) {
    const old = i.id ? original.get(i.id) : undefined;
    if (old && (old.received > 0 || !isActiveSize(old.size)))
      await db.query(
        "UPDATE production_order_items SET qty=$2,priority=$3 WHERE id=$1",
        [i.id, i.qty, i.priority],
      );
    else
      await db.query(
        "INSERT INTO production_order_items(id,order_id,variant_id,qty,priority) VALUES($1,$2,$3,$4,$5)",
        [i.id || randomUUID(), id, i.variantId, i.qty, i.priority],
      );
  }
  const { items, ...fields } = next;
  const body = {
    ...before,
    ...fields,
    cancelled: before.cancelled && !parsed.reopen,
    updatedAt: new Date().toISOString(),
  };
  delete (body as Partial<ProductionOrder>).items;
  await db.query(
    "UPDATE production_orders SET code=$2,body=$3,supplier_id=$4,version=version+1 WHERE id=$1",
    [id, code, JSON.stringify(body), await setSupplier(db, next.supplier)],
  );
  const after = await loadOrder(db, id);
  await db.query(
    "INSERT INTO production_order_revisions VALUES($1,$2,$3,now(),$4,$5,$6)",
    [
      randomUUID(),
      id,
      actor.id,
      parsed.reason,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
  await audit(db, actor.id, "order.edit", id, {
    reason: parsed.reason,
    before,
    after,
  });
  return after;
}
export async function orderAction(
  db: DB,
  actor: Actor,
  id: string,
  action: string,
  raw: unknown,
) {
  const { expectedVersion, reason } = z
    .object({
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(450),
    })
    .strict()
    .parse(raw);
  const before = await loadOrder(db, id, true);
  checkVersion(before, expectedVersion);
  if (action !== "restore") active(before);
  else if (!before.deletedAt) throw new AppError(409, "Lệnh chưa bị xóa");
  const body = { ...before, updatedAt: new Date().toISOString() };
  delete (body as Partial<ProductionOrder>).items;
  if (action === "delete") {
    body.deletedAt = new Date().toISOString();
    body.deletedBy = actor.id;
    body.deletedReason = reason;
    body.pendingAtDeletion = totals(before).pending;
  } else if (action === "restore") {
    body.deletedAt = null;
  } else if (action === "cancel") {
    if (!totals(before).pending)
      throw new AppError(409, "Lệnh không còn phần chưa nhận");
    body.cancelled = true;
  } else if (action === "reopen") {
    if (!before.cancelled)
      throw new AppError(409, "Lệnh chưa hủy phần còn lại");
    body.cancelled = false;
  } else throw new AppError(400, "Hành động không hợp lệ");
  await db.query(
    "UPDATE production_orders SET body=$2,version=version+1 WHERE id=$1",
    [id, JSON.stringify(body)],
  );
  const after = await loadOrder(db, id);
  if (action === "delete" || action === "restore")
    await db.query(
      "INSERT INTO archived_orders VALUES($1,$2,$3,now(),$4,$5,$6)",
      [randomUUID(), id, actor.id, action, reason, JSON.stringify(before)],
    );
  await audit(db, actor.id, "order." + action, id, { reason, before, after });
  return after;
}
export const receiptSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    date: z.iso.date(),
    note: z.string().max(1000),
    lines: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            qty: z.number().int().min(1).max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();
export async function receive(
  db: DB,
  actor: Actor,
  id: string,
  key: string,
  raw: unknown,
) {
  if (!/^[\w-]{8,120}$/.test(key))
    throw new AppError(400, "Cần Idempotency-Key hợp lệ");
  const input = receiptSchema.parse(raw),
    hash = createHash("sha256")
      .update(JSON.stringify({ ...input, actor: actor.id }))
      .digest("hex");
  const before = await loadOrder(db, id, true);
  const prior = (
    await db.query(
      "SELECT * FROM production_receipts WHERE order_id=$1 AND idempotency_key=$2",
      [id, key],
    )
  ).rows[0];
  if (prior) {
    if (prior.request_hash !== hash)
      throw new AppError(409, "Khóa gửi lặp đã dùng với nội dung khác");
    return prior.response;
  }
  active(before);
  checkVersion(before, input.expectedVersion);
  if (before.cancelled) throw new AppError(409, "Lệnh đã hủy phần còn chờ");
  if (new Set(input.lines.map((l) => l.itemId)).size !== input.lines.length)
    throw new AppError(400, "Trùng dòng nhận hàng");
  for (const l of input.lines) {
    const item = before.items.find((i) => i.id === l.itemId);
    if (!item) throw new AppError(409, "Dòng nhận hàng không thuộc lệnh");
  }
  const rid = randomUUID(),
    result = {
      receiptId: rid,
      orderId: id,
      received: input.lines.reduce((n, l) => n + l.qty, 0),
      version: before.version + 1,
    };
  await db.query(
    "INSERT INTO production_receipts(id,order_id,actor_id,date,note,idempotency_key,request_hash,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      rid,
      id,
      actor.id,
      input.date,
      input.note,
      key,
      hash,
      JSON.stringify(result),
    ],
  );
  for (const l of input.lines) {
    const item = before.items.find((i) => i.id === l.itemId)!;
    await db.query(
      "INSERT INTO production_receipt_items VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        rid,
        id,
        l.itemId,
        l.qty,
        JSON.stringify({ sku: item.sku, color: item.color, size: item.size }),
      ],
    );
    await db.query(
      "UPDATE production_order_items SET received=received+$2 WHERE id=$1",
      [l.itemId, l.qty],
    );
  }
  await db.query(
    "UPDATE production_orders SET version=version+1,body=jsonb_set(body,'{updatedAt}',to_jsonb(now()::text)) WHERE id=$1",
    [id],
  );
  await audit(db, actor.id, "receipt.create", rid, { orderId: id, ...input });
  return result;
}
export async function dashboard() {
  return transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const skus = await variants(db),
      orders = (await listOrders(db)).filter((o) => !o.deletedAt);
    const policy = policySchema.parse(
      (await db.query("SELECT body FROM planning_policies WHERE id=1")).rows[0]
        .body,
    );
    const calculations = skus.map((s) => ({
      ...s,
      forecast: forecast(s, policy),
    }));
    return {
      skus,
      orders,
      policy,
      policyVersion: (
        await db.query("SELECT version FROM planning_policies WHERE id=1")
      ).rows[0].version,
      calculations,
    };
  });
}
