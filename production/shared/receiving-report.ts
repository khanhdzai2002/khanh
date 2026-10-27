import { z } from "zod";
import { sizes, isActiveSize, type ProductionOrder } from "./domain";
import { normalizeLabel } from "./incoming-goods";
export const receivingFilters = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sku: z.string().max(90).default(""),
    color: z.string().max(200).default(""),
    size: z.enum(["", ...sizes]).default(""),
    supplier: z.string().max(200).default(""),
    classification: z.enum(["all", "matched", "unmatched"]).default("all"),
    search: z.string().max(300).default(""),
    includeDrafts: z.enum(["true", "false"]).default("false"),
    includePaused: z.enum(["true", "false"]).default("false"),
    limit: z.coerce.number().int().min(50).max(1000).default(100),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
  });
export type ReceivingEntry = {
  id: string;
  receiptId: string;
  draftId: string | null;
  actor: string;
  date: string;
  supplier: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  classification: "matched" | "unmatched";
  orderId: string | null;
  code: string;
  bag: string;
  note: string;
  reason: string;
  archived: boolean;
};
export function receivingReport(
  entries: ReceivingEntry[],
  orders: ProductionOrder[],
  raw: unknown,
  today: string,
) {
  const f = receivingFilters.parse(raw);
  const identity = (r: {
    sku: string;
    color: string;
    size: string;
    supplier: string;
  }) =>
    (!f.sku || r.sku.toUpperCase() === f.sku.toUpperCase()) &&
    (!f.color || r.color === f.color) &&
    (!f.size || r.size === f.size) &&
    (!f.supplier || r.supplier === f.supplier);
  const search = (text: string) =>
    normalizeLabel(text).includes(normalizeLabel(f.search));
  const rows = entries
    .filter(
      (r) =>
        isActiveSize(r.size) &&
        identity(r) &&
        (!f.from || r.date >= f.from) &&
        (!f.to || r.date <= f.to) &&
        (f.classification === "all" || f.classification === r.classification) &&
        search(
          [
            r.sku,
            r.color,
            r.size,
            r.supplier,
            r.code,
            r.bag,
            r.note,
            r.reason,
          ].join(" "),
        ),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.sku.localeCompare(b.sku));
  const sum = (r: ReceivingEntry[]) => r.reduce((n, r) => n + r.qty, 0),
    matched = rows.filter((r) => r.classification === "matched"),
    unmatched = rows.filter((r) => r.classification === "unmatched");
  const products = new Map<
    string,
    {
      sku: string;
      qty: number;
      matched: number;
      unmatched: number;
      share: number;
      colors: Map<string, any>;
    }
  >();
  for (const r of rows) {
    const sku = r.sku.trim().toUpperCase();
    const p = products.get(sku) || {
      sku,
      qty: 0,
      matched: 0,
      unmatched: 0,
      share: 0,
      colors: new Map(),
    };
    p.qty += r.qty;
    p[r.classification] += r.qty;
    const k = r.color.trim().toLocaleLowerCase("vi");
    const c = p.colors.get(k) || {
      color: r.color,
      sizes: Object.fromEntries(sizes.map((s) => [s, 0])),
      qty: 0,
      matched: 0,
      unmatched: 0,
    };
    c.sizes[r.size] += r.qty;
    c.qty += r.qty;
    c[r.classification] += r.qty;
    p.colors.set(k, c);
    products.set(sku, p);
  }
  const total = sum(rows),
    productRows = [...products.values()]
      .map((p) => ({
        ...p,
        share: total ? (p.qty / total) * 100 : 0,
        colors: [...p.colors.values()].sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.qty - a.qty);
  const daily = new Map<
    string,
    { date: string; matched: number; unmatched: number; total: number }
  >();
  for (const r of rows) {
    const d = daily.get(r.date) || {
      date: r.date,
      matched: 0,
      unmatched: 0,
      total: 0,
    };
    d[r.classification] += r.qty;
    d.total += r.qty;
    daily.set(r.date, d);
  }
  const debt = orders
    .filter(
      (o) =>
        !o.deletedAt &&
        !o.cancelled &&
        (f.includeDrafts === "true" || o.status !== "Nháp") &&
        (f.includePaused === "true" || o.status !== "Tạm dừng"),
    )
    .flatMap((o) =>
      o.items
        .filter(
          (i) =>
            isActiveSize(i.size) &&
            i.qty > i.received &&
            identity({ ...i, supplier: o.supplier }) &&
            search([o.code, o.supplier, i.sku, i.color, i.size].join(" ")),
        )
        .map((i) => ({
          orderId: o.id,
          code: o.code,
          supplier: o.supplier,
          delivery: o.delivery,
          status: o.status,
          sku: i.sku,
          color: i.color,
          size: i.size,
          placed: i.qty,
          received: i.received,
          pending: Math.max(0, i.qty - i.received),
          overdue: !!o.delivery && o.delivery < today,
        })),
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        b.pending - a.pending ||
        a.code.localeCompare(b.code),
    );
  return {
    filters: f,
    options: {
      skus: [
        ...new Set([
          ...entries.map((r) => r.sku),
          ...orders.flatMap((o) => o.items.map((i) => i.sku)),
        ]),
      ].sort(),
      suppliers: [
        ...new Set([
          ...entries.map((r) => r.supplier),
          ...orders.map((o) => o.supplier),
        ]),
      ].sort(),
    },
    totals: {
      received: total,
      matched: sum(matched),
      unmatched: sum(unmatched),
      unmatchedPercent: total ? (sum(unmatched) / total) * 100 : 0,
      products: products.size,
      matchedReceipts: new Set(matched.map((r) => r.receiptId)).size,
      unmatchedSlips: new Set(unmatched.map((r) => r.draftId)).size,
      pending: debt.reduce((n, r) => n + r.pending, 0),
      pendingOrders: new Set(debt.map((r) => r.orderId)).size,
      overdueOrders: new Set(
        debt.filter((r) => r.overdue).map((r) => r.orderId),
      ).size,
    },
    products: productRows,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    entries: rows.slice(0, f.limit),
    entryCount: rows.length,
    debt: debt.slice(0, f.limit),
    debtCount: debt.length,
    exportEntries: rows,
  };
}
