import { z } from "zod";
import { sizes, statuses, type ProductionOrder } from "./domain";
import { productionReport } from "./production-report";
export const pendingFilters = z
  .object({
    query: z.string().max(300).default(""),
    sku: z.string().max(90).default(""),
    color: z.string().max(200).default(""),
    size: z.union([z.enum(sizes), z.literal("")]).default(""),
    supplier: z.string().max(200).default(""),
    status: z.union([z.enum(statuses), z.literal("")]).default(""),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    includeDrafts: z.enum(["true", "false"]).default("false"),
    includePaused: z.enum(["true", "false"]).default("false"),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
  );
export type PendingFilters = z.infer<typeof pendingFilters>;
export const searchable = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
export function pendingProduction(
  orders: ProductionOrder[],
  raw: unknown = {},
) {
  const filters = pendingFilters.parse(raw);
  const base = productionReport(orders, {
    from: filters.from,
    to: filters.to,
    supplier: filters.supplier,
    includeDrafts: filters.includeDrafts,
    includePaused: filters.includePaused,
  });
  const lines = base.lines.filter(
    (l) =>
      l.pending > 0 &&
      (!filters.sku || l.sku === filters.sku.toUpperCase()) &&
      (!filters.color ||
        l.color.toLowerCase() === filters.color.toLowerCase()) &&
      (!filters.size || l.size === filters.size) &&
      (!filters.status || l.status === filters.status) &&
      (!filters.query ||
        searchable(filters.query)
          .split(/\s+/)
          .every((word) =>
            searchable(
              [l.sku, l.color, l.size, l.code, l.supplier].join(" "),
            ).includes(word),
          )),
  );
  const grouped = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = JSON.stringify([l.sku, l.color.toLowerCase()]);
    const old = grouped.get(key) || [];
    old.push(l);
    grouped.set(key, old);
  }
  const rows = [...grouped.entries()]
    .map(([key, items]) => {
      const sources = [...new Set(items.map((l) => l.orderId))].map((id) => {
        const values = items.filter((l) => l.orderId === id),
          head = values[0];
        return {
          id,
          code: head.code,
          supplier: head.supplier,
          status: head.status,
          delivery: head.delivery,
          overdue: values.some((l) => l.overdue),
          quantities: Object.fromEntries(
            sizes.map((s) => [
              s,
              values
                .filter((l) => l.size === s)
                .reduce((n, l) => n + l.pending, 0),
            ]),
          ),
          pending: values.reduce((n, l) => n + l.pending, 0),
        };
      });
      const due = sources
        .map((o) => o.delivery)
        .filter((v): v is string => !!v)
        .sort();
      return {
        key,
        sku: items[0].sku,
        color: items[0].color,
        quantities: Object.fromEntries(
          sizes.map((s) => [
            s,
            items
              .filter((l) => l.size === s)
              .reduce((n, l) => n + l.pending, 0),
          ]),
        ),
        pending: items.reduce((n, l) => n + l.pending, 0),
        sources,
        due: due[0] || null,
        overdue: sources.some((o) => o.overdue),
      };
    })
    .sort(
      (a, b) =>
        a.sku.localeCompare(b.sku) ||
        b.pending - a.pending ||
        a.color.localeCompare(b.color, "vi"),
    );
  const total = lines.reduce((n, l) => n + l.pending, 0);
  const products = [...new Set(lines.map((l) => l.sku))]
    .map((sku) => ({
      sku,
      pending: lines
        .filter((l) => l.sku === sku)
        .reduce((n, l) => n + l.pending, 0),
    }))
    .sort((a, b) => b.pending - a.pending || a.sku.localeCompare(b.sku))
    .map((p) => ({ ...p, share: total ? (p.pending / total) * 100 : 0 }));
  const slices = [...products.slice(0, 8).map((p) => ({ ...p, other: false }))];
  if (products.length > 8) {
    const rest = products.slice(8).reduce((n, p) => n + p.pending, 0);
    slices.push({
      sku: `Khác (${products.length - 8} mã)`,
      pending: rest,
      share: total ? (rest / total) * 100 : 0,
      other: true,
    });
  }
  return {
    filters,
    rows,
    products,
    slices,
    total,
    orderCount: new Set(lines.map((l) => l.orderId)).size,
    overdueOrders: new Set(lines.filter((l) => l.overdue).map((l) => l.orderId))
      .size,
    sizeTotals: Object.fromEntries(
      sizes.map((s) => [
        s,
        lines.filter((l) => l.size === s).reduce((n, l) => n + l.pending, 0),
      ]),
    ),
  };
}
export function pendingProductionRows(
  report: ReturnType<typeof pendingProduction>,
) {
  return [
    [
      "Mã SP",
      "Màu",
      ...sizes,
      "Tổng còn chờ",
      "Số lệnh liên quan",
      "Hẹn sớm nhất",
      "Có quá hạn",
      "Lệnh liên quan",
    ],
    ...report.rows.map((r) => [
      r.sku,
      r.color,
      ...sizes.map((s) => r.quantities[s]),
      r.pending,
      r.sources.length,
      r.due,
      r.overdue ? "Có" : "Không",
      r.sources.map((s) => s.code).join(", "),
    ]),
  ];
}
