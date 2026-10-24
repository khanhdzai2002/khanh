import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, can, statuses, totals, type Role } from "../shared/domain";
import { audit, type DB } from "./db";
import { loadOrder, type Actor } from "./service";
const inputSchema = z
  .object({
    orders: z
      .array(
        z
          .object({
            id: z.uuid().transform((value) => value.toLowerCase()),
            expectedVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    status: z.enum(statuses),
    reason: z.string().trim().min(3).max(450),
  })
  .strict()
  .refine(
    (v) => new Set(v.orders.map((o) => o.id)).size === v.orders.length,
    "Không chọn trùng lệnh",
  );
export async function bulkOrderStatus(db: DB, actor: Actor, raw: unknown) {
  const input = inputSchema.parse(raw);
  const user = (
    await db.query("SELECT role,disabled FROM users WHERE id=$1", [actor.id])
  ).rows[0];
  if (!user || user.disabled || !can(user.role as Role, "order"))
    throw new AppError(403, "Bạn không có quyền đổi trạng thái lệnh");
  const before = [];
  // The caller owns a single transaction. Validate all locked orders first;
  // do not rewrite order items or receipt rows for a metadata-only change.
  for (const target of [...input.orders].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const o = await loadOrder(db, target.id, true);
    if (o.version !== target.expectedVersion)
      throw new AppError(
        409,
        `${o.code} đã thay đổi; tải lại trước khi đổi hàng loạt`,
      );
    if (o.deletedAt || o.cancelled || totals(o).pending === 0)
      throw new AppError(
        409,
        `${o.code} đã xóa, hủy hoặc giao đủ; không thể đổi trạng thái nội bộ hàng loạt`,
      );
    before.push(o);
  }
  const batchId = randomUUID();
  let changed = 0;
  for (const o of before) {
    if (o.status === input.status) continue;
    const { items, ...body } = o;
    await db.query(
      "UPDATE production_orders SET body=$2,version=version+1 WHERE id=$1",
      [
        o.id,
        JSON.stringify({
          ...body,
          status: input.status,
          updatedAt: new Date().toISOString(),
        }),
      ],
    );
    const after = await loadOrder(db, o.id);
    await db.query(
      "INSERT INTO production_order_revisions VALUES($1,$2,$3,now(),$4,$5,$6)",
      [
        randomUUID(),
        o.id,
        actor.id,
        input.reason,
        JSON.stringify(o),
        JSON.stringify(after),
      ],
    );
    await audit(db, actor.id, "order.status.bulk", o.id, {
      batchId,
      reason: input.reason,
      before: o,
      after,
    });
    changed++;
  }
  return {
    batchId,
    changed,
    unchanged: before.length - changed,
    status: input.status,
  };
}
