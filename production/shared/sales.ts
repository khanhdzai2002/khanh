import { salesDay } from "./sales-file";
export type SalesRow = {
  lineKey: string;
  date: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  kind: "single" | "combo" | "unknown" | "excluded";
  variation: string;
  reason: string;
};
export function orderCode(name: string, seller: string) {
  let m =
    name
      .toUpperCase()
      .match(/(?:^|[^A-Z0-9])MIU\s*[-_]?\s*0*(\d{1,3})(?!\d)/) ||
    seller.toUpperCase().match(/MIU\s*[-_]?\s*0*(\d{1,3})(?!\d)/);
  if (m) return "MIU" + m[1].padStart(2, "0");
  m = seller.toUpperCase().match(/MAN\s*[-_]?\s*0*(\d{1,3})(?!\d)/);
  if (m) return "MAN" + m[1].padStart(2, "0");
  m = name.toUpperCase().match(/(?:^|[^A-Z0-9])MAN\s*[-_]?\s*(\d{2})(?!\d)/);
  return m ? "MAN" + m[1] : "CHƯA RÕ MÃ";
}
export function classifyVariation(
  sku: string,
  variation: string,
): [string, string] {
  const x = variation.trim(),
    m = /(?:^|,)\s*(2XL|XXL|XL|XS|S|M|L)(?=\s|\(|$|,)/i.exec(x);
  if (!m) return [x || "(Không rõ màu)", "CHƯA RÕ SIZE"];
  const size = m[1].toUpperCase() === "XXL" ? "2XL" : m[1].toUpperCase();
  const color =
      x.slice(0, m.index).replace(/,\s*$/, "").trim() || "(Không rõ màu)",
    key = color
      .normalize("NFKD")
      .toLowerCase()
      .replace(/đ/g, "d")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const maps: Record<string, string[][]> = {
    MIU66: [
      ["xamdamphoixanhthan", "Xám (phối tay xanh than)"],
      ["trangphoiden", "Trắng (phối tay đen)"],
      ["hongphoinau", "Hồng (phối tay nâu scl)"],
      ["trangphoixanhtiffany", "Trắng (phối tay xanh Tiffany)"],
      ["ghitayphoinau", "Ghi tây (phối tay nâu scl)"],
      ["trangphoido", "Trắng (phối đỏ)"],
    ],
    MIU01: [
      ["xanhtiffany", "Xanh Tiffany"],
      ["nausocola", "Nâu scl"],
      ["nauscl", "Nâu scl"],
    ],
    MIU37: [
      ["camchay", "Cam cháy (phối đen)"],
      ["ghitay", "Ghi tây (phối nâu)"],
      ["den", "Đen (phối hồng)"],
      ["xamtieu", "Xám tiêu (phối xanh than)"],
    ],
  };
  return [
    (maps[sku] || []).find(([k]) => key.startsWith(k))?.[1] || color,
    size,
  ];
}
export function parseSalesRow(
  r: Record<string, string>,
  lineKey: string,
): SalesRow {
  const source = String(r["Created Time"] || "");
  const date = salesDay(source);
  const qty = Number(r.Quantity),
    returned = Number(r["Sku Quantity of return"] || 0);
  if (
    !Number.isSafeInteger(qty) ||
    qty < 0 ||
    !Number.isSafeInteger(returned) ||
    returned < 0
  )
    throw Error("Số lượng/hoàn trả phải là số nguyên không âm");
  const status = r["Order Status"] || "",
    typ = r["Cancelation/Return Type"] || "",
    variation = r.Variation || "",
    sku = orderCode(r["Product Name"] || "", r["Seller SKU"] || ""),
    [color, size] = classifyVariation(sku, variation);
  const excluded =
    /hủy|cancel|chưa thanh toán|unpaid/i.test(status) ||
    /return|refund|cancel|trả hàng|hoàn tiền/i.test(typ) ||
    /trả hàng|hoàn tiền|returned/i.test(status);
  const combo = /(?:\b[2345]\s*[ÁA]\s*O\b|\bCOMBO\b|\bSET\b|\b2\s*Á0\b)/i.test(
    variation,
  );
  const unknown =
    sku === "CHƯA RÕ MÃ" ||
    size === "CHƯA RÕ SIZE" ||
    color === "(Không rõ màu)";
  return {
    lineKey,
    date,
    sku,
    name: String(r["Product Name"] || "").slice(0, 300),
    color,
    size,
    qty: excluded ? qty : Math.max(0, qty - returned),
    kind: excluded
      ? "excluded"
      : combo
        ? "combo"
        : unknown
          ? "unknown"
          : "single",
    variation,
    reason: excluded
      ? status + " / " + typ
      : combo
        ? "Combo chưa phân bổ màu/size"
        : unknown
          ? "Thiếu mã, màu hoặc size"
          : "",
  };
}
export function shiftDay(day: string, n: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
export function rates(
  rows: { date: string; qty: number }[],
  lastFullDay: string,
) {
  const inWindow = (n: number) =>
    rows
      .filter(
        (r) => r.date >= shiftDay(lastFullDay, 1 - n) && r.date <= lastFullDay,
      )
      .reduce((s, r) => s + r.qty, 0);
  const day1 = rows
      .filter((r) => r.date === shiftDay(lastFullDay, -1))
      .reduce((s, r) => s + r.qty, 0),
    day2 = rows
      .filter((r) => r.date === lastFullDay)
      .reduce((s, r) => s + r.qty, 0);
  const q2 = inWindow(2),
    q7 = inWindow(7),
    r2 = q2 / 2,
    r7 = q7 / 7;
  const signal = trendSignal(r2, r7);
  return { day1, day2, q2, q7, r2, r7, signal, viral: r7 > 0 && r2 / r7 > 2 };
}
export function trendSignal(r2: number, r7: number) {
  const ratio = r7 ? r2 / r7 : 0,
    diff = r2 - r7;
  return r2 <= 0 && r7 <= 0
    ? "Chưa rõ"
    : r7 <= 0 && r2 > 0
      ? "Tăng trưởng"
      : ratio >= 1.2 && diff >= 0.5
        ? "Tăng trưởng"
        : ratio <= 0.8 && diff <= -0.5
          ? "Giảm sút"
          : "Duy trì";
}
