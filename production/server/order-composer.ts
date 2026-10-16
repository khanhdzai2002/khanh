import { z } from "zod";
import {
  AppError,
  orderSchema,
  sizes,
  type OrderInput,
} from "../shared/domain";
import type { DB } from "./db";
import {
  createOrder,
  editOrder,
  loadOrder,
  saveSku,
  type Actor,
} from "./service";

// Resolve draft-only identities and save the order in the caller's transaction.
// No catalogue records survive a failed order save.
const draftSchema = z
  .object({
    order: orderSchema,
    newSkus: z
      .array(
        z
          .object({
            id: z.uuid(),
            sku: z.string().trim().min(1).max(90),
            color: z.string().trim().min(1).max(200),
            size: z.enum(sizes),
          })
          .strict(),
      )
      .max(2000),
    expectedVersion: z.number().int().positive().optional(),
    reason: z.string().trim().min(3).max(450).optional(),
    reopen: z.boolean().optional(),
  })
  .strict();

export async function composeOrder(
  db: DB,
  actor: Actor,
  raw: unknown,
  id?: string,
) {
  const input = draftSchema.parse(raw);
  if (id) {
    if (!input.expectedVersion || !input.reason)
      throw new AppError(
        400,
        "Cần phiên bản lệnh và lý do chỉnh sửa ít nhất 3 ký tự.",
      );
    // Lock/version check precedes catalogue changes; editOrder revalidates all receipts.
    const old = await loadOrder(db, id, true);
    if (old.version !== input.expectedVersion)
      throw new AppError(
        409,
        "Lệnh đã được người khác cập nhật. Đóng và mở lại lệnh trước khi sửa.",
      );
  } else if (input.expectedVersion || input.reason || input.reopen) {
    throw new AppError(400, "Lệnh mới không dùng thông tin chỉnh sửa lệnh cũ.");
  }
  const drafts = new Map(input.newSkus.map((s) => [s.id, s]));
  if (
    drafts.size !== input.newSkus.length ||
    input.newSkus.some(
      (s) => !input.order.items.some((i) => i.variantId === s.id),
    )
  )
    throw new AppError(
      400,
      "Danh mục nháp bị trùng hoặc chứa SKU không có trong lệnh.",
    );
  if (input.newSkus.length)
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('comsflow:order-catalog'))",
    );
  const resolved = new Map<string, string>();
  for (const draft of input.newSkus) {
    if (
      (await db.query("SELECT 1 FROM variants WHERE id=$1", [draft.id]))
        .rowCount
    )
      throw new AppError(
        400,
        "Không được dùng danh mục nháp để thay đổi định danh SKU đã lưu.",
      );
    const code = draft.sku.toUpperCase();
    const found = await db.query(
      "SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.code=$1 AND v.color_key=$2 AND v.size=$3",
      [code, draft.color.toLowerCase(), draft.size],
    );
    const variantId =
      found.rows[0]?.id ||
      (await saveSku(db, actor, {
        sku: code,
        color: draft.color,
        size: draft.size,
      }));
    resolved.set(draft.id, variantId);
  }
  const order: OrderInput = {
    ...input.order,
    items: input.order.items.map((i) => ({
      ...i,
      variantId: resolved.get(i.variantId) || i.variantId,
    })),
  };
  return id
    ? editOrder(db, actor, id, {
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        reopen: input.reopen,
        order,
      })
    : createOrder(db, actor, order);
}
