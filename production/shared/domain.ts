import { z } from "zod";
export const stages = ["Mở bán", "Tăng trưởng", "Giảm sút", "Xả kho"] as const;
export const sizes = ["S", "M", "L", "XL"] as const;
export const historicalSizes = ["XS", ...sizes, "2XL"] as const;
export const isActiveSize = (size: string) =>
  (sizes as readonly string[]).includes(size);
export const priorities = ["THƯỜNG", "ƯU TIÊN", "CẤP BÁCH"] as const;
export const statuses = [
  "Nháp",
  "Đã gửi xưởng",
  "Đã xác nhận",
  "Đang sản xuất",
  "Tạm dừng",
] as const;
export const roles = [
  "Administrator",
  "Production Planner",
  "Warehouse Operator",
  "Manager",
  "Viewer",
] as const;
export type Role = (typeof roles)[number];
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const policySchema = z
  .object({
    targetDays: z.number().int().min(1).max(45),
    leadDays: z.number().int().min(0).max(30),
    safeDays: z.number().int().min(0).max(20),
    includeLead: z.boolean(),
    roundTo: z.number().int().min(1).max(1000),
  })
  .strict();
export type Policy = z.infer<typeof policySchema>;
export const defaultPolicy: Policy = {
  targetDays: 5,
  leadDays: 3,
  safeDays: 0,
  includeLead: false,
  roundTo: 1,
};
const amount = z.number().finite().min(0).max(1e9);
export const skuSchema = z
  .object({
    sku: z.string().trim().min(1).max(90),
    name: z.string().max(300).default(""),
    color: z.string().trim().min(1).max(200),
    size: z.enum(sizes),
    day1: amount.default(0),
    day2: amount.default(0),
    stock: amount.int().nullable().default(null),
    inbound: amount.int().default(0),
    health: z.enum(stages).default("Mở bán"),
    pilotQty: amount.int().max(100000).default(0),
    abnormal: z.boolean().default(false),
    manualRate: amount.default(0),
    selected: z.boolean().default(false),
    inventorySource: z.string().max(300).default("Nhập thủ công"),
    inventoryAt: z.iso.datetime({ offset: true }).nullable().default(null),
    salesSource: z.string().max(300).default("Nhập thủ công"),
  })
  .strict();
export const historicalSkuSchema = skuSchema.extend({
  size: z.enum(historicalSizes),
});
export type Sku = z.infer<typeof historicalSkuSchema>;
export type Variant = Sku & { id: string; version: number };
export function forecast(row: Sku, policy: Policy = defaultPolicy) {
  const valid = policySchema.safeParse(policy).success;
  const sale = row.abnormal ? row.manualRate : (row.day1 + row.day2) / 2;
  const known = row.stock !== null,
    cover = known && sale > 0 ? row.stock! / sale : null;
  const effectiveDays =
    policy.targetDays +
    policy.safeDays +
    (policy.includeLead ? policy.leadDays : 0);
  if (!isActiveSize(row.size))
    return {
      need: 0,
      raw: 0,
      target: 0,
      sale,
      cover,
      effectiveDays,
      flag: "retired",
      basis: "Size đã ngừng kinh doanh",
    };
  let need = 0,
    raw = 0,
    target = 0,
    flag = "new",
    basis = "Không tự gối; nhập SL test";
  if (!valid) {
    flag = "invalid";
    basis = "Sửa thiết lập ngày / bội số";
  } else if (row.health === "Xả kho") {
    flag = "clear";
    basis = "DỪNG GỐI: xả tồn";
  } else if (row.health === "Giảm sút") {
    flag = "paused";
    basis = "DỪNG GỐI: bán giảm";
  } else if (row.health === "Mở bán") {
    raw = Math.floor(row.pilotQty);
    need = raw;
    basis = `SL test thủ công: ${need}`;
  } else if (!known) {
    flag = "unknown";
    basis = "CHƯA NHẬP TỒN";
  } else if (!sale) {
    flag = "unknown";
    basis = "Thiếu tốc độ bán chuẩn";
  } else {
    target = Math.ceil(sale * policy.targetDays);
    raw = Math.max(
      0,
      Math.ceil(sale * effectiveDays - row.stock! - row.inbound),
    );
    need = Math.ceil(raw / policy.roundTo) * policy.roundTo;
    flag = need
      ? cover !== null && cover <= policy.leadDays + 2
        ? "critical"
        : "warning"
      : "ok";
    basis = `${sale} × ${effectiveDays} − ${row.stock} − ${row.inbound}${policy.roundTo !== 1 ? ` (bội ${policy.roundTo})` : ""}`;
  }
  return { sale, cover, effectiveDays, need, raw, target, flag, basis };
}
export const orderItemSchema = z
  .object({
    id: z.uuid().optional(),
    variantId: z.uuid(),
    qty: z.number().int().min(1).max(1000000),
    priority: z.enum(priorities),
  })
  .strict();
export const orderSchema = z
  .object({
    code: z.string().trim().min(1).max(90).optional(),
    time: z.iso.datetime({ offset: true }),
    supplier: z.string().trim().min(1).max(200),
    delivery: z.iso.date().nullable(),
    requestedBy: z.string().trim().min(1).max(200),
    notes: z.string().max(3000),
    status: z.enum(statuses),
    items: z.array(orderItemSchema).min(1).max(2000),
  })
  .strict();
export type OrderInput = z.infer<typeof orderSchema>;
export type OrderItem = {
  id: string;
  variantId: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  received: number;
  priority: string;
};
export type ProductionOrder = {
  id: string;
  code: string;
  time: string;
  supplier: string;
  delivery: string | null;
  requestedBy: string;
  notes: string;
  status: string;
  cancelled: boolean;
  deletedAt: string | null;
  version: number;
  items: OrderItem[];
  createdBy: string;
  deletedReason?: string;
  deletedBy?: string;
  pendingAtDeletion?: number;
  createdAt: string;
  updatedAt: string;
};
export function totals(order: ProductionOrder) {
  const placed = order.items.reduce((n, i) => n + i.qty, 0),
    received = order.items.reduce((n, i) => n + i.received, 0),
    pending = order.cancelled
      ? 0
      : order.items.reduce((n, i) => n + Math.max(0, i.qty - i.received), 0),
    excess = order.items.reduce(
      (n, i) => n + Math.max(0, i.received - i.qty),
      0,
    );
  return {
    placed,
    received,
    pending,
    excess,
    percent: placed ? (received / placed) * 100 : 0,
    status: order.cancelled
      ? "Đã hủy phần còn lại"
      : pending === 0
        ? excess > 0
          ? "Đã giao vượt"
          : "Đã giao đủ"
        : received > 0
          ? "Đã giao một phần"
          : order.status,
  };
}
export function can(role: Role, action: string) {
  if (role === "Administrator") return true;
  return (
    (
      {
        read: ["Production Planner", "Warehouse Operator", "Manager", "Viewer"],
        plan: ["Production Planner"],
        order: ["Production Planner"],
        receive: ["Warehouse Operator"],
        archive: ["Production Planner"],
        approve: ["Manager"],
      } as Record<string, string[]>
    )[action]?.includes(role) ?? false
  );
}
