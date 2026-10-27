import { AppError, isActiveSize, type ProductionOrder } from "./domain";
import {
  normalizeLabel,
  type IncomingForm,
  type IncomingRow,
} from "./incoming-goods";
export type IncomingAllocation = {
  sourceRowId: string;
  orderId: string;
  code: string;
  supplier: string;
  itemId: string;
  variantId: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  pendingBefore: number;
  pendingAfter: number;
  excess: number;
};
export function incomingAllocation(
  form: IncomingForm,
  orders: ProductionOrder[],
) {
  if (form.rows.some((r) => r.qty === null))
    throw new AppError(
      400,
      "Điền số lượng cho tất cả dòng; nhập 0 nếu không có hàng",
    );
  if (new Set(form.rows.map((r) => r.id)).size !== form.rows.length)
    throw new AppError(400, "Trùng dòng nhập liệu");
  const positive = form.rows.filter((r) => (r.qty || 0) > 0);
  if (!positive.length)
    throw new AppError(400, "Phải có ít nhất một dòng nhận hàng");
  const active = orders.filter((o) => !o.deletedAt && !o.cancelled);
  const eligible = (o: ProductionOrder) =>
    (form.includeDrafts || o.status !== "Nháp") &&
    (form.includePaused || o.status !== "Tạm dừng") &&
    (!form.supplier || o.supplier === form.supplier);
  const matching = (o: ProductionOrder, r: IncomingRow) =>
    o.items.find(
      (i) =>
        i.variantId === r.variantId &&
        i.size === r.size &&
        isActiveSize(i.size) &&
        normalizeLabel(i.sku) === normalizeLabel(r.sku) &&
        (r.allocationMode !== "auto" ||
          normalizeLabel(i.color) === normalizeLabel(r.color)),
    );
  const fifo = [...active].sort(
    (a, b) =>
      Date.parse(a.time) - Date.parse(b.time) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.code.localeCompare(b.code) ||
      a.id.localeCompare(b.id),
  );
  const reserved = new Map<string, number>();
  const allocations: IncomingAllocation[] = [];
  const unallocated: {
    rowId: string;
    sku: string;
    color: string;
    size: string;
    qty: number;
    reason: string;
  }[] = [];
  const missing = (r: IncomingRow, qty: number, reason: string) =>
    unallocated.push({
      rowId: r.id,
      sku: r.sku,
      color: r.color,
      size: r.size,
      qty,
      reason,
    });
  const add = (o: ProductionOrder, r: IncomingRow, qty: number) => {
    const i = matching(o, r)!;
    const pendingBefore = Math.max(
      0,
      i.qty - i.received - (reserved.get(i.id) || 0),
    );
    allocations.push({
      sourceRowId: r.id,
      orderId: o.id,
      code: o.code,
      supplier: o.supplier,
      itemId: i.id,
      variantId: i.variantId,
      sku: i.sku,
      color: i.color,
      size: i.size,
      qty,
      pendingBefore,
      pendingAfter: Math.max(0, pendingBefore - qty),
      excess: Math.max(0, qty - pendingBefore),
    });
    reserved.set(i.id, (reserved.get(i.id) || 0) + qty);
  };
  // Reserve explicit manual entries first so automatic rows never use the same
  // outstanding capacity twice, regardless of table row order.
  for (const r of positive.filter((r) => r.allocationMode !== "auto")) {
    const o = active.find(
      (o) =>
        o.id === r.orderId &&
        (!form.supplier || o.supplier === form.supplier) &&
        matching(o, r),
    );
    if (o) add(o, r, r.qty!);
    else
      missing(
        r,
        r.qty!,
        "Chọn đúng lệnh nhận có cùng mã–màu–size và nhà xưởng",
      );
  }
  for (const r of positive.filter((r) => r.allocationMode === "auto")) {
    const candidates = fifo.filter((o) => eligible(o) && matching(o, r));
    const pending = candidates.filter((o) => {
      const i = matching(o, r)!;
      return i.qty - i.received - (reserved.get(i.id) || 0) > 0;
    });
    if (!form.supplier && new Set(pending.map((o) => o.supplier)).size > 1) {
      missing(
        r,
        r.qty!,
        "SKU có lệnh ở nhiều xưởng. Chọn Nhà xưởng trả hàng trước khi tự động cộng dồn",
      );
      continue;
    }
    let left = r.qty!;
    for (const o of pending) {
      const i = matching(o, r)!;
      const take = Math.min(
        left,
        Math.max(0, i.qty - i.received - (reserved.get(i.id) || 0)),
      );
      if (take > 0) {
        add(o, r, take);
        left -= take;
      }
      if (!left) break;
    }
    if (left && r.excessOrderId) {
      const target = candidates.find((o) => o.id === r.excessOrderId);
      if (target) {
        add(target, r, left);
        left = 0;
      }
    }
    if (left)
      missing(
        r,
        left,
        candidates.length
          ? "Hàng về vượt tổng còn thiếu. Chọn lệnh nhận phần giao dư hoặc tách dòng nhận thủ công"
          : "Không có lệnh phù hợp. Kiểm tra mã–màu–size, xưởng và tùy chọn Nháp/Tạm dừng",
      );
  }
  const ids = [...new Set(allocations.map((a) => a.orderId))].sort();
  if (ids.length > 200 || allocations.length > 1000)
    throw new AppError(
      400,
      "Phiếu quá lớn. Chia thành các phiếu nhỏ hơn (tối đa 200 lệnh / 1.000 dòng phân bổ)",
    );
  const balances = [...new Set(positive.map((r) => r.variantId))]
    .filter(Boolean)
    .flatMap((variantId) => {
      const rows = positive.filter((r) => r.variantId === variantId);
      const related = active
        .filter(
          (o) =>
            (eligible(o) ||
              rows.some(
                (r) => r.allocationMode !== "auto" && r.orderId === o.id,
              )) &&
            (!form.supplier || o.supplier === form.supplier),
        )
        .flatMap((o) => o.items.filter((i) => i.variantId === variantId));
      if (!related.length) return [];
      const sample = related[0];
      return [
        {
          variantId,
          sku: sample.sku,
          color: sample.color,
          size: sample.size,
          pendingBefore: related.reduce(
            (n, i) => n + Math.max(0, i.qty - i.received),
            0,
          ),
          receivedNow: allocations
            .filter((a) => a.variantId === variantId)
            .reduce((n, a) => n + a.qty, 0),
          pendingAfter: related.reduce(
            (n, i) =>
              n + Math.max(0, i.qty - i.received - (reserved.get(i.id) || 0)),
            0,
          ),
        },
      ];
    });
  return {
    allocations,
    unallocated,
    balances,
    pendingBefore: balances.reduce((n, b) => n + b.pendingBefore, 0),
    pendingAfter: balances.reduce((n, b) => n + b.pendingAfter, 0),
    orders: ids.map((id) => ({
      id,
      version: active.find((o) => o.id === id)!.version,
    })),
    entered: positive.reduce((n, r) => n + r.qty!, 0),
    allocated: allocations.reduce((n, a) => n + a.qty, 0),
    remaining: unallocated.reduce((n, r) => n + r.qty, 0),
    excess: allocations.reduce((n, a) => n + a.excess, 0),
  };
}
export function incomingAllocationSnapshot(
  form: IncomingForm,
  orders: ProductionOrder[],
) {
  const variants = new Set(
    form.rows.filter((r) => (r.qty || 0) > 0).map((r) => r.variantId),
  );
  // Include excluded/cancelled/deleted candidates too: a status change, new
  // matching order or changed quantities must invalidate the preview.
  return orders
    .filter((o) => o.items.some((i) => variants.has(i.variantId)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((o) => ({
      id: o.id,
      version: o.version,
      time: o.time,
      supplier: o.supplier,
      status: o.status,
      cancelled: o.cancelled,
      deletedAt: o.deletedAt,
      items: o.items
        .map((i) => ({
          id: i.id,
          variantId: i.variantId,
          qty: i.qty,
          received: i.received,
          sku: i.sku,
          color: i.color,
          size: i.size,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }));
}
