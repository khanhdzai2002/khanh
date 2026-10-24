import { z } from "zod";
import { isActiveSize, sizes, type ProductionOrder } from "./domain";
export const productionReportFilters = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sku: z.string().max(90).default(""),
    orderId: z.union([z.uuid(), z.literal("")]).default(""),
    supplier: z.string().max(200).default(""),
    scope: z.enum(["pending", "all"]).default("pending"),
    basis: z.enum(["pending", "placed"]).default("pending"),
    includeDrafts: z.enum(["true", "false"]).default("false"),
    includePaused: z.enum(["true", "false"]).default("false"),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
  );
export type ProductionReportFilters = z.infer<typeof productionReportFilters>;
export function vietnamDay(value: string | number = Date.now()) {
  return new Date(new Date(value).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
}
export function productionReport(
  orders: ProductionOrder[],
  raw: unknown = {},
  today = vietnamDay(),
) {
  const filters = productionReportFilters.parse(raw);
  type Line = {
    orderId: string;
    code: string;
    date: string;
    supplier: string;
    delivery: string | null;
    status: string;
    sku: string;
    color: string;
    size: string;
    placed: number;
    received: number;
    pending: number;
    orderPlaced: number;
    overdue: boolean;
  };
  const lines: Line[] = [];
  for (const o of orders) {
    if (
      o.deletedAt ||
      o.cancelled ||
      (filters.orderId && o.id !== filters.orderId) ||
      (o.status === "Nháp" && filters.includeDrafts !== "true") ||
      (o.status === "Tạm dừng" && filters.includePaused !== "true")
    )
      continue;
    const date = vietnamDay(o.time);
    if (
      (filters.from && date < filters.from) ||
      (filters.to && date > filters.to) ||
      (filters.supplier && o.supplier !== filters.supplier)
    )
      continue;
    const orderPlaced = o.items.reduce((n, i) => n + i.qty, 0);
    for (const i of o.items) {
      if (!isActiveSize(i.size)) continue;
      const pending = Math.max(0, i.qty - i.received);
      if (
        (filters.sku && i.sku.toUpperCase() !== filters.sku.toUpperCase()) ||
        (filters.scope === "pending" &&
          !o.items.some(
            (j) =>
              isActiveSize(j.size) &&
              j.sku.toUpperCase() === i.sku.toUpperCase() &&
              j.qty > j.received,
          ))
      )
        continue;
      lines.push({
        orderId: o.id,
        code: o.code,
        date,
        supplier: o.supplier,
        delivery: o.delivery,
        status: o.status,
        sku: i.sku.toUpperCase(),
        color: i.color,
        size: i.size,
        placed: i.qty,
        received: i.received,
        pending,
        orderPlaced,
        overdue: !!o.delivery && o.delivery < today && pending > 0,
      });
    }
  }
  const total = lines.reduce(
    (a, l) => ({
      placed: a.placed + l.placed,
      received: a.received + l.received,
      pending: a.pending + l.pending,
    }),
    { placed: 0, received: 0, pending: 0 },
  );
  const denominator = total[filters.basis];
  const codes = [...new Set(lines.map((l) => l.sku))];
  const products = codes
    .map((sku) => {
      const items = lines.filter((l) => l.sku === sku),
        sums = items.reduce(
          (a, l) => ({
            placed: a.placed + l.placed,
            received: a.received + l.received,
            pending: a.pending + l.pending,
          }),
          { placed: 0, received: 0, pending: 0 },
        );
      const colors = [...new Set(items.map((l) => l.color.toLowerCase()))]
        .map((key) => {
          const variants = items.filter((l) => l.color.toLowerCase() === key);
          return {
            color: variants[0].color,
            quantities: Object.fromEntries(
              sizes.map((size) => [
                size,
                variants
                  .filter((l) => l.size === size)
                  .reduce((n, l) => n + l[filters.basis], 0),
              ]),
            ),
            total: variants.reduce((n, l) => n + l[filters.basis], 0),
          };
        })
        .sort(
          (a, b) => b.total - a.total || a.color.localeCompare(b.color, "vi"),
        );
      const sources = [...new Set(items.map((l) => l.orderId))]
        .map((id) => {
          const subset = items.filter((l) => l.orderId === id),
            head = subset[0],
            placed = subset.reduce((n, l) => n + l.placed, 0);
          return {
            id,
            code: head.code,
            date: head.date,
            supplier: head.supplier,
            delivery: head.delivery,
            status: head.status,
            placed,
            received: subset.reduce((n, l) => n + l.received, 0),
            pending: subset.reduce((n, l) => n + l.pending, 0),
            shareInOrder: head.orderPlaced
              ? (placed / head.orderPlaced) * 100
              : 0,
            overdue: subset.some((l) => l.overdue),
          };
        })
        .sort(
          (a, b) =>
            Number(b.overdue) - Number(a.overdue) ||
            b.date.localeCompare(a.date) ||
            a.code.localeCompare(b.code),
        );
      return {
        sku,
        ...sums,
        share: denominator ? (sums[filters.basis] / denominator) * 100 : 0,
        orderCount: sources.length,
        supplierCount: new Set(items.map((l) => l.supplier)).size,
        colors,
        sources,
        overdueOrders: sources.filter((s) => s.overdue).length,
      };
    })
    .sort(
      (a, b) =>
        b[filters.basis] - a[filters.basis] || a.sku.localeCompare(b.sku),
    );
  return {
    filters,
    today,
    totals: {
      ...total,
      products: products.length,
      orders: new Set(lines.map((l) => l.orderId)).size,
      overdueOrders: new Set(
        lines.filter((l) => l.overdue).map((l) => l.orderId),
      ).size,
    },
    products,
    lines,
  };
}
export function productionReportRows(
  report: ReturnType<typeof productionReport>,
) {
  return [
    [
      "Mã SP",
      "Màu",
      "Size",
      "Mã lệnh",
      "Ngày lập (VN)",
      "Xưởng",
      "Hẹn giao",
      "Trạng thái nội bộ",
      "Đã đặt",
      "Đã nhận",
      "Còn chờ",
      "Tỷ trọng mã trong lệnh (%)",
      "Tỷ trọng mã trong báo cáo (%)",
      "Cơ sở tỷ trọng báo cáo",
      "Quá hạn",
    ],
    ...report.lines.map((l) => {
      const p = report.products.find((p) => p.sku === l.sku)!;
      return [
        l.sku,
        l.color,
        l.size,
        l.code,
        l.date,
        l.supplier,
        l.delivery,
        l.status,
        l.placed,
        l.received,
        l.pending,
        p.sources.find((s) => s.id === l.orderId)!.shareInOrder,
        p.share,
        report.filters.basis === "pending" ? "Còn chờ" : "Đã đặt",
        l.overdue ? "Có" : "Không",
      ];
    }),
  ];
}
