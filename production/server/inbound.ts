import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { audit, type DB } from "./db";
import { AppError } from "../shared/domain";
import type { Actor } from "./service";
export const inboundRequest = z
  .object({
    ids: z.array(z.uuid()).min(1).max(2000),
    includeDrafts: z.boolean().default(false),
    includePaused: z.boolean().default(false),
  })
  .strict()
  .refine((v) => new Set(v.ids).size === v.ids.length, "SKU bị chọn trùng");
async function orderSnapshot(db: DB) {
  // Lock orders first, matching edit/receipt lock order. New orders created after
  // this read belong to the next reconciliation; existing orders cannot change.
  const orders = (
    await db.query(
      "SELECT id,code,body,version FROM production_orders ORDER BY id FOR SHARE",
    )
  ).rows;
  const items = (
    await db.query(
      "SELECT id,order_id,variant_id,qty,received FROM production_order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id",
      [orders.map((o) => o.id)],
    )
  ).rows;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ orders, items }))
    .digest("hex");
  return { orders, items, fingerprint };
}
export async function previewInbound(db: DB, actor: Actor, raw: unknown) {
  const input = inboundRequest.parse(raw),
    snapshot = await orderSnapshot(db);
  const variants = (
    await db.query(
      "SELECT id,body,version FROM variants WHERE id=ANY($1::uuid[]) ORDER BY id",
      [input.ids],
    )
  ).rows;
  if (variants.length !== input.ids.length)
    throw new AppError(409, "SKU đã thay đổi hoặc không còn tồn tại");
  const reasons: Record<string, string> = {};
  const ignored: { code: string; reason: string }[] = [];
  for (const o of snapshot.orders) {
    const b = o.body;
    const reason = b.deletedAt
      ? "Đã xóa"
      : b.cancelled
        ? "Đã hủy phần còn lại"
        : b.status === "Nháp" && !input.includeDrafts
          ? "Nháp"
          : b.status === "Tạm dừng" && !input.includePaused
            ? "Tạm dừng"
            : "";
    if (reason) {
      reasons[o.id] = reason;
      ignored.push({ code: o.code, reason });
    }
  }
  const orders = new Map(snapshot.orders.map((o) => [o.id, o]));
  const rows = variants.map((v) => {
    const sources = snapshot.items
      .filter(
        (i) =>
          i.variant_id === v.id && i.qty > i.received && !reasons[i.order_id],
      )
      .map((i) => {
        const order = orders.get(i.order_id)!;
        return {
          orderId: order.id,
          code: order.code,
          status: order.body.status,
          ordered: i.qty,
          received: i.received,
          pending: i.qty - i.received,
        };
      });
    return {
      id: v.id,
      version: v.version,
      sku: v.body.sku,
      color: v.body.color,
      size: v.body.size,
      previous: v.body.inbound,
      inbound: sources.reduce((n, i) => n + i.pending, 0),
      sources,
    };
  });
  const errors = rows.some((r) => r.inbound > 1e9)
    ? ["Tổng hàng đang về vượt giới hạn 1 tỷ/SKU; cần đối soát lại lệnh"]
    : [];
  const id = randomUUID(),
    body = {
      rows,
      ignored,
      errors,
      input,
      fingerprint: snapshot.fingerprint,
      fetchedAt: new Date().toISOString(),
    };
  await db.query(
    "INSERT INTO import_previews(id,actor_id,kind,body) VALUES($1,$2,'inbound-reconciliation',$3)",
    [id, actor.id, JSON.stringify(body)],
  );
  return { id, ...body };
}
export async function confirmInbound(db: DB, actor: Actor, id: string) {
  const preview = (
    await db.query("SELECT * FROM import_previews WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (
    !preview ||
    preview.actor_id !== actor.id ||
    preview.kind !== "inbound-reconciliation"
  )
    throw new AppError(404, "Không tìm thấy bản đối soát của bạn");
  if (preview.status === "done")
    return { replayed: true, count: preview.body.rows.length };
  const body = preview.body;
  if (body.errors.length)
    throw new AppError(400, "Sửa lỗi đối soát trước khi cập nhật");
  if (Date.now() - Date.parse(body.fetchedAt) > 15 * 60000)
    throw new AppError(409, "Bản đối soát quá 15 phút; hãy đối soát lại");
  const snapshot = await orderSnapshot(db);
  if (snapshot.fingerprint !== body.fingerprint)
    throw new AppError(
      409,
      "Lệnh hoặc giao nhận đã thay đổi; hãy đối soát lại",
    );
  const rows = (
    await db.query(
      "SELECT id,body,version FROM variants WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [body.rows.map((r: any) => r.id)],
    )
  ).rows;
  const current = new Map(rows.map((v) => [v.id, v]));
  for (const row of body.rows) {
    const v = current.get(row.id);
    if (!v || v.version !== row.version)
      throw new AppError(409, "SKU đã được cập nhật; hãy đối soát lại");
  }
  for (const row of body.rows) {
    const v = current.get(row.id)!;
    await db.query(
      "UPDATE variants SET body=jsonb_set(body,'{inbound}',to_jsonb($2::bigint)),version=version+1 WHERE id=$1",
      [row.id, row.inbound],
    );
    await db.query(
      "INSERT INTO inventory_snapshots VALUES($1,$2,$3,$4,$5,now(),$6)",
      [
        randomUUID(),
        row.id,
        v.body.stock,
        row.inbound,
        "Đối soát lệnh sản xuất",
        actor.id,
      ],
    );
  }
  await audit(db, actor.id, "planning.inbound.reconcile", id, {
    rows: body.rows,
    includeDrafts: body.input.includeDrafts,
    includePaused: body.input.includePaused,
    fetchedAt: body.fetchedAt,
  });
  await db.query("UPDATE import_previews SET status='done' WHERE id=$1", [id]);
  return { count: body.rows.length, replayed: false };
}
