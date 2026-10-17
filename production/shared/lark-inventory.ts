import { z } from "zod";
import { sizes, AppError } from "./domain";
const field = z.string().trim().min(1).max(200);
export const inventorySourceSchema = z
  .object({
    url: z.string().url().max(1000),
    mapping: z
      .object({
        sku: field,
        color: field,
        date: field,
        sizes: z
          .object({
            XS: z.string().max(200),
            S: z.string().max(200),
            M: z.string().max(200),
            L: z.string().max(200),
            XL: z.string().max(200),
            "2XL": z.string().max(200),
          })
          .strict(),
      })
      .strict(),
    blankAsZero: z.boolean().default(true),
    createMissing: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    const names = [
      v.mapping.sku,
      v.mapping.color,
      v.mapping.date,
      ...Object.values(v.mapping.sizes).filter(Boolean),
    ];
    if (!Object.values(v.mapping.sizes).some(Boolean))
      ctx.addIssue({ code: "custom", message: "Chọn ít nhất một cột size" });
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        message: "Không ánh xạ một cột vào nhiều trường",
      });
    try {
      parseBaseUrl(v.url);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Cần link HTTPS Lark Base hoặc Wiki có table và view",
      });
    }
  });
export type InventorySource = z.infer<typeof inventorySourceSchema>;
export function parseBaseUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError(400, "Link Lark không hợp lệ");
  }
  const path = /^\/(wiki|base)\/([a-zA-Z0-9]{5,100})\/?$/.exec(u.pathname);
  const tableId = u.searchParams.get("table") || "",
    viewId = u.searchParams.get("view") || "";
  if (
    u.protocol !== "https:" ||
    !/^(?:[a-z0-9-]+\.)*larksuite\.com$/.test(u.hostname) ||
    u.username ||
    u.password ||
    u.port ||
    !path ||
    !/^tbl[a-zA-Z0-9]+$/.test(tableId) ||
    !/^vew[a-zA-Z0-9]+$/.test(viewId)
  )
    throw new AppError(
      400,
      "Cần link HTTPS Lark Base/Wiki có table và view; không dùng link chia sẻ rút gọn",
    );
  return { kind: path[1], token: path[2], tableId, viewId };
}
// Only flatten the documented single-value text / formula shapes. Multiple selections
// remain ambiguous and must not silently become a different product or colour.
export function cellText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    if (
      value.every(
        (x) => x && typeof x === "object" && typeof x.text === "string",
      )
    )
      return value
        .map((x) => x.text)
        .join("")
        .trim();
    return value.length === 1 ? cellText(value[0]) : "";
  }
  if (value && typeof value === "object") {
    const v = value as any;
    if ("value" in v) return cellText(v.value);
    if (typeof v.text === "string") return v.text.trim();
  }
  return "";
}
function day(value: unknown) {
  const text = cellText(value);
  if (/^\d{12,13}$/.test(text)) {
    const d = new Date(Number(text) + 7 * 3600000);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  const vn = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const date = match
    ? `${match[1]}-${match[2]}-${match[3]}`
    : vn
      ? `${vn[3]}-${vn[2]}-${vn[1]}`
      : "";
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !date ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return "";
  return date;
}
export type BaseRecord = {
  record_id?: string;
  fields: Record<string, unknown>;
};
export function normalizeInventory(
  records: BaseRecord[],
  source: InventorySource,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  const groups = new Map<
    string,
    { sku: string; color: string; date: string; records: BaseRecord[] }
  >();
  let olderRows = 0,
    blankCells = 0;
  for (const r of records) {
    const sku = cellText(r.fields[source.mapping.sku]).toUpperCase(),
      color = cellText(r.fields[source.mapping.color]);
    const date = day(r.fields[source.mapping.date]);
    if (!sku && !color && !date) continue;
    if (!sku || !color || !date || sku.length > 90 || color.length > 200) {
      errors.push(
        `Dòng ${r.record_id || "?"}: thiếu hoặc sai mã, màu, ngày kiểm`,
      );
      continue;
    }
    if (date > new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)) {
      errors.push(`${sku} / ${color}: ngày kiểm nằm trong tương lai`);
      continue;
    }
    const key = JSON.stringify([sku, color.toLowerCase()]),
      previous = groups.get(key);
    if (!previous || date > previous.date) {
      if (previous) olderRows += previous.records.length;
      groups.set(key, { sku, color, date, records: [r] });
    } else if (date === previous.date) previous.records.push(r);
    else olderRows++;
  }
  const rows: {
    sku: string;
    color: string;
    size: (typeof sizes)[number];
    stock: number;
    date: string;
    recordId: string;
  }[] = [];
  for (const g of groups.values()) {
    if (g.records.length !== 1) {
      errors.push(
        `${g.sku} / ${g.color}: trùng ${g.records.length} dòng ở ngày mới nhất ${g.date}; cần đối soát`,
      );
      continue;
    }
    for (const size of sizes) {
      const name = source.mapping.sizes[size];
      if (!name) continue;
      const value = g.records[0].fields[name];
      const raw = cellText(value);
      if (
        !raw &&
        value != null &&
        value !== "" &&
        !(Array.isArray(value) && !value.length)
      ) {
        errors.push(
          `${g.sku} / ${g.color} / ${size}: định dạng ô tồn không hợp lệ`,
        );
        continue;
      }
      if (!raw) {
        blankCells++;
        if (!source.blankAsZero) continue;
      }
      const stock = raw ? Number(raw) : 0;
      if (
        !/^\d+$/.test(raw || "0") ||
        !Number.isSafeInteger(stock) ||
        stock > 1e9
      ) {
        errors.push(
          `${g.sku} / ${g.color} / ${size}: tồn phải là số nguyên không âm`,
        );
        continue;
      }
      rows.push({
        sku: g.sku,
        color: g.color,
        size,
        stock,
        date: g.date,
        recordId: g.records[0].record_id || "",
      });
    }
  }
  if (olderRows)
    warnings.push(
      `Bỏ qua ${olderRows} dòng ngày kiểm cũ; chỉ lấy ngày mới nhất theo mã–màu.`,
    );
  if (blankCells)
    warnings.push(
      `${blankCells} ô size trống: ${source.blankAsZero ? "được tính bằng 0 theo lựa chọn của bạn" : "bỏ qua, không thay đổi tồn"}.`,
    );
  const stale = rows.filter(
    (r) =>
      Date.now() - new Date(r.date + "T00:00:00+07:00").getTime() >
      7 * 86400000,
  ).length;
  if (stale)
    warnings.push(
      `${stale} SKU có ngày kiểm cách hiện tại hơn 7 ngày. Kiểm tra kỳ tồn trước khi xác nhận.`,
    );
  return { rows, errors, warnings, readRows: records.length };
}
