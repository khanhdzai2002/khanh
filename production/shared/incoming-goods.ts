import { z } from "zod";
import { sizes, type Variant, type ProductionOrder } from "./domain";
export const incomingRowSchema = z
  .object({
    id: z.uuid(),
    sku: z.string().trim().min(1).max(90),
    color: z.string().trim().min(1).max(200),
    bag: z.string().max(80).default(""),
    bagGroupId: z.uuid().optional(),
    lineGroupId: z.uuid().optional(),
    size: z.enum(sizes),
    qty: z.number().int().min(0).max(1000000).nullable(),
    variantId: z.uuid().nullable(),
    orderId: z.uuid().nullable(),
    remember: z.boolean().default(false),
    allocationMode: z.enum(["manual", "auto"]).optional(),
    excessOrderId: z.uuid().nullable().optional(),
  })
  .strict();
export type IncomingRow = z.infer<typeof incomingRowSchema>;
export const incomingFormSchema = z
  .object({
    date: z.iso.date(),
    note: z.string().max(1000),
    supplier: z.string().max(200).optional(),
    includeDrafts: z.boolean().optional(),
    includePaused: z.boolean().optional(),
    rows: z.array(incomingRowSchema).min(1).max(1000),
  })
  .strict();
export type IncomingForm = z.infer<typeof incomingFormSchema>;
export type ColorAlias = { sku: string; raw_color: string; color: string };
export function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function matchColor(
  sku: string,
  raw: string,
  variants: Variant[],
  aliases: ColorAlias[],
) {
  const available = [
    ...new Set(
      variants
        .filter((v) => normalizeLabel(v.sku) === normalizeLabel(sku))
        .map((v) => v.color),
    ),
  ];
  if (["", "chua ro", "unknown", "khong ro"].includes(normalizeLabel(raw)))
    return { color: "", source: "Cần chọn màu" };
  const exact = available.filter(
    (c) => normalizeLabel(c) === normalizeLabel(raw),
  );
  if (exact.length === 1) return { color: exact[0], source: "Khớp danh mục" };
  const alias = aliases.find(
    (a) =>
      normalizeLabel(a.sku) === normalizeLabel(sku) &&
      a.raw_color === normalizeLabel(raw),
  );
  if (alias && available.includes(alias.color))
    return { color: alias.color, source: "Quy ước đã lưu" };
  const colorLabel = (value: string) =>
    normalizeLabel(value).replace(/^mau /, "");
  const tokens = colorLabel(raw).split(" ").filter(Boolean);
  const candidates = available.filter(
    (c) =>
      tokens.length &&
      colorLabel(c).split(" ")[0] === tokens[0] &&
      tokens.every((t) => colorLabel(c).split(" ").includes(t)),
  );
  return candidates.length === 1
    ? { color: candidates[0], source: "Gợi ý theo mã — cần kiểm tra" }
    : { color: "", source: "Cần chọn màu" };
}
export function incomingOrders(
  orders: ProductionOrder[],
  variantId: string | null,
) {
  return orders.filter(
    (o) =>
      !o.deletedAt &&
      !o.cancelled &&
      o.items.some((i) => i.variantId === variantId),
  );
}
