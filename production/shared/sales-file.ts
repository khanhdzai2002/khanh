import { z } from "zod";
import { AppError } from "./domain";
export const salesFileSchema = z
  .object({
    filename: z.string().min(1).max(200),
    base64: z.string().max(15e6),
  })
  .strict();
export const salesDay = (source: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(source);
  return m
    ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : source.slice(0, 10);
};
export const isDataRow = (r: Record<string, string>) =>
  !!r["Order ID"] &&
  !r["Order ID"].startsWith("Platform unique") &&
  r["Order ID"] !== "Order ID";
export function checkSalesColumns(rows: Record<string, string>[]) {
  const columns = Object.keys(rows[0] || {});
  const missing = [
    "Order ID",
    "Order Status",
    "Created Time",
    "Quantity",
  ].filter((c) => !columns.includes(c));
  if (missing.length)
    throw new AppError(
      400,
      "Không nhận diện được cột đơn hàng: thiếu " +
        missing.join(", ") +
        ". Hãy dùng file xuất đơn hàng theo SKU.",
    );
}
export function describeSalesFile(
  filename: string,
  rows: Record<string, string>[],
) {
  checkSalesColumns(rows);
  const data = rows.filter(isDataRow);
  const dates = data
    .map((r) => salesDay(r["Created Time"] || ""))
    .filter((d) => z.iso.date().safeParse(d).success)
    .sort();
  if (!data.length || !dates.length)
    throw new AppError(400, "File chưa có dòng đơn hàng với ngày tạo hợp lệ.");
  const m = /(20\d{2}-\d{2}-\d{2})[-_](\d{2})[_:.-](\d{2})/.exec(filename);
  const exported = m && `${m[1]}T${m[2]}:${m[3]}:00+07:00`;
  return {
    dataRows: data.length,
    columns: Object.keys(rows[0]).length,
    periodStart: dates[0],
    periodEnd: dates.at(-1)!,
    exportedAt:
      exported && z.iso.datetime({ offset: true }).safeParse(exported).success
        ? new Date(exported).toISOString()
        : null,
    stableKeys: data.every((r) => r["Order Line ID"] || r["SKU ID"]),
  };
}
